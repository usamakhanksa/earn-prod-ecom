import { z } from 'zod';
import { AUTH_TYPES, CONNECTOR_CATEGORIES, CONNECTOR_STATUSES, CONNECTOR_TIERS } from '../enums';

/**
 * `ConnectorDefinition` / `ConnectorVersion` (prompt.md data model — Phase 3 task 3.1).
 * Global, non-tenant rows (prompt.md's explicit "Global (non-tenant)" list) — every
 * tenant reads the same registry. See apps/api/prisma/schema.prisma for the schema
 * comment explaining why this is the deliberate exception to tenant scoping.
 */

export const connectorCapabilitiesSchema = z.object({
  canAutomate: z.boolean(),
  canPublish: z.boolean(),
  canUpdate: z.boolean(),
  canUnpublish: z.boolean(),
  canSyncOrders: z.boolean(),
  canFulfil: z.boolean(),
  canFetchCost: z.boolean(),
  canFetchEarnings: z.boolean(),
  supportsWebhooks: z.boolean(),
  supportsSandbox: z.boolean(),
  ordersMechanism: z.enum(['webhook', 'poll', 'none']),
});

export const connectorRateLimitSchema = z.object({
  requests: z.number().int().positive(),
  windowMs: z.number().int().positive(),
  burst: z.number().int().positive(),
});

export const connectorImageSpecSchema = z.object({
  placement: z.string().min(1),
  minWidthPx: z.number().int().positive(),
  minHeightPx: z.number().int().positive(),
  dpiMin: z.number().int().positive(),
  formats: z.array(z.string().min(1)),
});

export const connectorFieldSpecSchema = z.object({
  maxTitle: z.number().int().positive(),
  maxDescription: z.number().int().positive(),
  maxTags: z.number().int().nonnegative(),
  imageSpecs: z.array(connectorImageSpecSchema),
});

export const connectorDefinitionInputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  name: z.string().min(1).max(120),
  category: z.enum(CONNECTOR_CATEGORIES),
  tier: z.enum(CONNECTOR_TIERS),
  status: z.enum(CONNECTOR_STATUSES).default('UNVERIFIED'),
  authType: z.enum(AUTH_TYPES),
  apiDocsUrl: z.string().url().nullable().optional(),
  tosUrl: z.string().url().nullable().optional(),
  verifiedAt: z.string().datetime().nullable().optional(),
  verifiedBy: z.string().min(1).max(200).nullable().optional(),
  requiresPartnerApproval: z.boolean().default(false),
  rateLimit: connectorRateLimitSchema,
  capabilities: connectorCapabilitiesSchema,
  fieldSpec: connectorFieldSpecSchema.nullable().optional(),
});
export type ConnectorDefinitionInput = z.infer<typeof connectorDefinitionInputSchema>;

export const updateConnectorDefinitionSchema = connectorDefinitionInputSchema.partial().extend({
  slug: connectorDefinitionInputSchema.shape.slug.optional(),
});
export type UpdateConnectorDefinitionInput = z.infer<typeof updateConnectorDefinitionSchema>;

export interface ConnectorDefinitionSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  tier: string;
  status: string;
  authType: string;
  apiDocsUrl: string | null;
  tosUrl: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  requiresPartnerApproval: boolean;
  rateLimit: unknown;
  capabilities: unknown;
  fieldSpec: unknown;
  createdAt: string;
  updatedAt: string;
}

export const listConnectorsQuerySchema = z.object({
  tier: z.enum(CONNECTOR_TIERS).optional(),
  category: z.enum(CONNECTOR_CATEGORIES).optional(),
  includeQuarantined: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
});
export type ListConnectorsQuery = z.infer<typeof listConnectorsQuerySchema>;
