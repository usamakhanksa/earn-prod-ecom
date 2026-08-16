import type { ConnectorCapabilities, ConnectorErrorCode, ConnectorTier } from '@omnisell/shared';

/**
 * Connector SDK types (prompt.md "CONNECTOR SDK — implement exactly this shape").
 * Pure data shapes only — no Prisma, no NestJS. `apps/api` maps its own Prisma
 * rows into these before calling an adapter, and maps adapter output back.
 */

export interface Connector {
  id: string;
  slug: string;
  tier: ConnectorTier;
  capabilities: ConnectorCapabilities;
  apiDocsUrl: string | null;
  tosUrl: string | null;
}

/** Only connectors in this type may be automated (prompt.md constraint #1). */
export type AutomatableConnector = Connector & {
  capabilities: ConnectorCapabilities & { canAutomate: true };
};

/** Decrypted, per-call context an adapter needs. Built by apps/api's
 * CredentialVaultService from an encrypted `Credential` row — an adapter never
 * receives ciphertext, and the plaintext never survives past one call's scope. */
export interface Ctx {
  tenantId: string;
  connectionId: string;
  sandbox: boolean;
  /** API key / PAT / OAuth access token — whichever the connector's authType uses. */
  accessToken?: string;
  /** Prodigi ships separate sandbox/live keys (api-registration.md §2.1). */
  secondaryToken?: string;
  /** Printify: shop is a required path parameter once resolved (api-registration.md §2.1). */
  externalAccountId?: string;
  refreshToken?: string;
  expiresAt?: string;
}

/** Context for the pre-connection OAuth handshake — no token yet. */
export interface AuthCtx {
  tenantId: string;
  connectionId: string;
  redirectUri: string;
  state: string;
  /** PKCE code_verifier (OAUTH2_PKCE authType only). */
  codeVerifier?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO-8601
  scope?: string;
  externalAccountId?: string;
  externalAccountLabel?: string;
}

export interface HealthResult {
  ok: boolean;
  accountLabel: string | null;
  scopes: string[];
  latencyMs: number;
  message: string;
}

export interface PrintAreaSpec {
  code: string;
  name: string;
  widthIn: number;
  heightIn: number;
  dpiMin: number;
  dpiRecommended: number;
  bleedIn: number;
  safeAreaIn: number;
  allowsTransparency: boolean;
  colorProfile: 'RGB' | 'CMYK' | 'UNKNOWN';
}

export interface BlueprintVariantInput {
  providerVariantId: string;
  size: string;
  color: string;
  colorHex?: string;
  sku?: string;
  baseCostMinor: bigint;
  currency: string;
  inStock: boolean;
}

export interface Blueprint {
  providerBlueprintId: string;
  name: string;
  category: string;
  printAreas: PrintAreaSpec[];
  sizes: string[];
  colors: Array<{ name: string; hex: string }>;
  variants: BlueprintVariantInput[];
}

export interface CostQuote {
  providerVariantId: string;
  costMinor: bigint;
  currency: string;
  shippingMinor?: bigint;
  destinationCountry?: string;
}

export interface PublishInput {
  listingId: string;
  externalBlueprintId: string;
  title: string;
  description: string;
  tags: string[];
  images: Array<{ placement: string; url: string }>;
  variants: Array<{ providerVariantId: string; priceMinor: bigint; currency: string }>;
}

export interface UpdateInput extends PublishInput {
  externalId: string;
}

export interface PublishResult {
  externalId: string;
  statusUrl: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NormalisedOrderItem {
  externalVariantId: string;
  quantity: number;
  priceMinor: bigint;
  currency: string;
}

export interface NormalisedOrder {
  externalOrderId: string;
  status: string;
  buyerName: string | null;
  buyerEmail: string | null;
  currency: string;
  totalMinor: bigint;
  items: NormalisedOrderItem[];
  createdAt: string;
}

export interface RawWebhook {
  headers: Record<string, string>;
  body: unknown;
}

export interface NormalisedEvent {
  type: string;
  externalOrderId: string | null;
  occurredAt: string;
  raw: unknown;
}

export interface FulfilInput {
  externalOrderId: string;
  shippingAddress?: Record<string, string>;
}

export interface Fulfilment {
  externalFulfilmentId: string;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface EarningsRow {
  periodStart: string;
  periodEnd: string;
  grossMinor: bigint;
  feesMinor: bigint;
  currency: string;
}

/** Tier C only — never produced by a Tier A/B adapter (prompt.md constraint #1). */
export interface ExportPackSpec {
  channelSlug: string;
  files: Array<{ name: string; sourceUrl: string }>;
  metadataCsv: string;
  checklistMarkdown: string;
}

/**
 * Phase 4 — the live snapshot of a listing as the CHANNEL currently sees it,
 * for drift detection (implentationplanphase.md task 4.13). Deliberately the
 * smallest useful shape: the fields OmniSell itself can diverge on (title,
 * description, tags, price, status), not a full provider-native payload.
 */
export interface RemoteListingState {
  externalId: string;
  title: string;
  description: string;
  tags: string[];
  priceMinor: bigint;
  currency: string;
  status: string;
}

export interface ConnectorError {
  code: ConnectorErrorCode;
  retryable: boolean;
  userMessage: string;
  docsHint: string | null;
  httpStatus: number | null;
}
