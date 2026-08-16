import { z } from 'zod';
import { CONNECTION_STATUSES, CREDENTIAL_KINDS, RETENTION_CHOICES } from '../enums';

/**
 * Connections & credential vault (prompt.md Phase 3 tasks 3.2/3.3/3.9).
 * Two creation paths, matching api-registration.md §1:
 *  - API_KEY/PAT: paste the secret directly (`credential.value`), tested immediately.
 *  - OAUTH2/OAUTH2_PKCE: `POST /connections` creates a PENDING row, then
 *    `GET /connections/:id/oauth/start` returns the redirect URL; the secret never
 *    passes through this schema — it lands via the provider callback exchange.
 */

export const createConnectionSchema = z.object({
  connectorSlug: z.string().min(2).max(64),
  label: z.string().min(1).max(120),
  sandbox: z.boolean().default(false),
  credential: z
    .object({
      kind: z.enum(CREDENTIAL_KINDS),
      value: z.string().min(1).max(4096),
      // Prodigi ships separate sandbox/live keys (api-registration.md §2.1) — an
      // API_KEY credential may carry a second value for the other environment.
      secondaryValue: z.string().min(1).max(4096).optional(),
    })
    .optional(),
});
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const rotateCredentialSchema = z.object({
  value: z.string().min(1).max(4096),
  secondaryValue: z.string().min(1).max(4096).optional(),
});
export type RotateCredentialInput = z.infer<typeof rotateCredentialSchema>;

export const disconnectConnectionSchema = z.object({
  retention: z.enum(RETENTION_CHOICES).default('KEEP_ORPHAN'),
});
export type DisconnectConnectionInput = z.infer<typeof disconnectConnectionSchema>;

export interface ConnectionSummary {
  id: string;
  connectorSlug: string;
  label: string;
  status: (typeof CONNECTION_STATUSES)[number];
  authType: string;
  sandbox: boolean;
  scopesGranted: string[] | null;
  externalAccountLabel: string | null;
  maskedHint: string | null;
  lastTestedAt: string | null;
  lastSuccessAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface TestConnectionResult {
  ok: boolean;
  accountLabel: string | null;
  scopes: string[];
  latencyMs: number;
  message: string;
  checkedAt: string;
}

export interface ConnectionHealthSampleView {
  id: string;
  checkedAt: string;
  success: boolean;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
}

export interface ConnectionHealthView {
  connectionId: string;
  connectorSlug: string;
  label: string;
  status: string;
  lastSuccessAt: string | null;
  errorRatePct: number;
  avgLatencyMs: number | null;
  rateLimitRemaining: number | null;
  tokenExpiresAt: string | null;
  tokenExpiresInSeconds: number | null;
  samples: ConnectionHealthSampleView[];
  isSeedData: boolean;
}

// --- Connector OAuth 2.0 + PKCE (distinct from Phase 1's user-login SSO
// oauth.ts — this authorises a *connector*, not a person). ---

export const connectorOAuthStartQuerySchema = z.object({
  redirectAfter: z.string().max(500).optional(),
});
export type ConnectorOAuthStartQuery = z.infer<typeof connectorOAuthStartQuerySchema>;

export const connectorOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().optional(),
});
export type ConnectorOAuthCallbackQuery = z.infer<typeof connectorOAuthCallbackQuerySchema>;
