/**
 * Domain enums shared across OmniSell apps. Mirrors prompt.md + docs/points-extension.md.
 * Kept as `as const` tuples so zod and TypeScript can both derive from them.
 */

export const CONNECTOR_TIERS = ['A', 'B', 'C', 'D'] as const;
export type ConnectorTier = (typeof CONNECTOR_TIERS)[number];

export const CONNECTOR_STATUSES = ['ACTIVE', 'BETA', 'GATED', 'UNVERIFIED', 'RETIRED'] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTOR_CATEGORIES = ['POD', 'DIGITAL', 'ECOM', 'GIG', 'RESEARCH', 'PAYMENT'] as const;
export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export const AUTH_TYPES = ['OAUTH2_PKCE', 'OAUTH2', 'API_KEY', 'PAT', 'NONE'] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/** Organisation membership roles (prompt.md Phase 1.4 — 7 org roles). */
export const ORG_ROLES = ['OWNER', 'ADMIN', 'DESIGNER', 'FINANCE', 'ANALYST', 'SUPPORT', 'MEMBER'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Point economy (docs/points-extension.md §6.1). */
export const POINT_TRANSACTION_TYPES = ['EARN', 'SPEND', 'ADJUST', 'EXPIRY'] as const;
export type PointTransactionType = (typeof POINT_TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['PENDING', 'VALIDATED', 'REVERSED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const WATCH_STATUSES = ['STARTED', 'WATCHING', 'COMPLETED', 'FRAUD_SUSPECT', 'CREDITED'] as const;
export type WatchStatus = (typeof WATCH_STATUSES)[number];

export const PURCHASE_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** OAuth SSO providers (prompt.md Phase 1.3). */
export const OAUTH_PROVIDERS = ['GOOGLE', 'APPLE'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Invite lifecycle (prompt.md Phase 1.6 / featureslist.md 1.10). */
export const INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Notification centre (prompt.md Phase 1.12). Kept small on purpose — the skeleton
 * only needs coarse categories; per-feature types can be added as new phases wire
 * real events without a breaking change (string column, not a DB enum). */
export const NOTIFICATION_TYPES = ['SECURITY', 'TEAM', 'BILLING', 'SYSTEM'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Studio — Assets (Phase 2 / featureslist.md §2). */
export const ASSET_KINDS = ['IMAGE', 'VECTOR', 'DOCUMENT'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_COLOR_PROFILES = ['RGB', 'CMYK', 'UNKNOWN'] as const;
export type AssetColorProfile = (typeof ASSET_COLOR_PROFILES)[number];

export const ASSET_COLOR_LABELS = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE', 'GREY'] as const;
export type AssetColorLabel = (typeof ASSET_COLOR_LABELS)[number];

export const UPLOAD_MODES = ['PRESIGNED', 'RESUMABLE'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

export const UPLOAD_SESSION_STATUSES = ['OPEN', 'COMPLETE', 'ABORTED'] as const;
export type UploadSessionStatus = (typeof UPLOAD_SESSION_STATUSES)[number];

/** Print-file preflight engine (featureslist.md 2.7). `SKIPPED` covers a rule
 * that could not run for lack of metadata (e.g. no vector stroke-width data),
 * and never contributes to the overall PASS/WARN/FAIL rollup. */
export const PREFLIGHT_RULES = [
  'FILE_SIZE',
  'DPI',
  'DIMENSIONS',
  'BLEED_SAFE_AREA',
  'COLOR_PROFILE',
  'TRANSPARENCY',
  'MIN_STROKE_WIDTH',
] as const;
export type PreflightRule = (typeof PREFLIGHT_RULES)[number];

export const PREFLIGHT_RULE_STATUSES = ['PASS', 'WARN', 'FAIL', 'SKIPPED'] as const;
export type PreflightRuleStatus = (typeof PREFLIGHT_RULE_STATUSES)[number];

export const PREFLIGHT_OVERALL_STATUSES = ['PASS', 'WARN', 'FAIL'] as const;
export type PreflightOverallStatus = (typeof PREFLIGHT_OVERALL_STATUSES)[number];

/** Catalog (Phase 2 / featureslist.md §3). */
export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PLACEMENT_CODES = ['FRONT', 'BACK', 'SLEEVE_LEFT', 'SLEEVE_RIGHT', 'INNER_LABEL', 'ALL_OVER'] as const;
export type PlacementCode = (typeof PLACEMENT_CODES)[number];

export const PRICING_METHODS = ['COST_PLUS_PERCENT', 'FIXED_MARGIN', 'TARGET_PRICE'] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];

export const ROUNDING_MODES = ['NONE', 'PSYCHOLOGICAL_99', 'NEAREST_INTEGER', 'NEAREST_5'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const MOCKUP_RENDER_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type MockupRenderStatus = (typeof MOCKUP_RENDER_STATUSES)[number];

/** Connector capability flags (prompt.md). canAutomate === false → Export Pack path only. */
export interface ConnectorCapabilities {
  canAutomate: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  canUnpublish: boolean;
  canSyncOrders: boolean;
  canFulfil: boolean;
  canFetchCost: boolean;
  canFetchEarnings: boolean;
  supportsWebhooks: boolean;
  supportsSandbox: boolean;
  ordersMechanism: 'webhook' | 'poll' | 'none';
}

/** Connector rate-limit config persisted on `ConnectorDefinition.rateLimit` (prompt.md). */
export interface ConnectorRateLimitConfig {
  requests: number;
  windowMs: number;
  burst: number;
}

/** Image spec entry inside `ConnectorDefinition.fieldSpec.imageSpecs[]` (prompt.md). */
export interface ConnectorImageSpec {
  placement: string;
  minWidthPx: number;
  minHeightPx: number;
  dpiMin: number;
  formats: string[];
}

/** `ConnectorDefinition.fieldSpec` — per-channel field limits (prompt.md). */
export interface ConnectorFieldSpec {
  maxTitle: number;
  maxDescription: number;
  maxTags: number;
  imageSpecs: ConnectorImageSpec[];
}

/** Channels & Connector Registry (Phase 3 / featureslist.md §4). */
export const CONNECTION_STATUSES = ['PENDING', 'CONNECTED', 'ERROR', 'DISCONNECTED'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Credential storage kind — mirrors api-registration.md §1's auth-mechanism table. */
export const CREDENTIAL_KINDS = ['OAUTH2', 'API_KEY', 'PAT', 'HMAC_PAIR', 'NONE'] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

/** Disconnect data-retention choice (featureslist.md 4.17). */
export const RETENTION_CHOICES = ['KEEP_ORPHAN', 'PURGE'] as const;
export type RetentionChoice = (typeof RETENTION_CHOICES)[number];

/**
 * Publishing Pipeline (Phase 4 / featureslist.md §5 / implentationplanphase.md
 * task 4.1). State machine EXACTLY as implentationplanphase.md's Phase 4 entry
 * specifies: `DRAFT -> PENDING -> QUEUED -> LIVE / REJECTED / ERROR`.
 *
 * Reconciliation note (docs/OPEN_QUESTIONS.md — genuine ambiguity): featureslist.md
 * 5.6 talks about "job queue with per-listing status" without naming these exact
 * six values, and neither doc says how the APPROVAL workflow (5.10) or Tier C's
 * "confirm manual upload" step (5.15/4.12) map onto this specific state machine.
 * Conservative default implemented here: `Listing.status` stays EXACTLY these six
 * values and never gains an approval- or export-pack-specific state; approval is
 * tracked on the orthogonal `approvalStatus` field below, and a Tier C listing
 * that has generated its Export Pack sits in `QUEUED` (queued for the human's
 * manual action) until the user confirms upload, at which point it becomes `LIVE`
 * — same terminal states a Tier A/B automated publish reaches, just via a
 * different path. See docs/OPEN_QUESTIONS.md for the full reasoning.
 */
export const LISTING_STATUSES = ['DRAFT', 'PENDING', 'QUEUED', 'LIVE', 'REJECTED', 'ERROR'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Orthogonal to `LISTING_STATUSES` — see the reconciliation note above.
 * `NONE` means no approval workflow was ever invoked for this listing (the
 * tenant/role may not require one at all). */
export const LISTING_APPROVAL_STATUSES = ['NONE', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type ListingApprovalStatus = (typeof LISTING_APPROVAL_STATUSES)[number];

/** Per-(listing,variant) publish outcome — prompt.md's "ListingVariant
 * (externalId, price, status)". */
export const LISTING_VARIANT_STATUSES = ['PENDING', 'LIVE', 'ERROR'] as const;
export type ListingVariantStatus = (typeof LISTING_VARIANT_STATUSES)[number];

/** ListingEvent.type — powers both the activity timeline (5.13) and the
 * approval comment thread (5.10); a comment is just an event with a body. */
export const LISTING_EVENT_TYPES = [
  'STATUS_CHANGE',
  'SUBMITTED_FOR_APPROVAL',
  'APPROVED',
  'REJECTED',
  'COMMENT',
  'ERROR',
  'RETRY',
  'SCHEDULED',
  'DRIFT_DETECTED',
  'DRIFT_RESOLVED',
  'EXPORT_PACK_GENERATED',
  'EXPORT_PACK_CONFIRMED',
  'POLICY_BLOCKED',
] as const;
export type ListingEventType = (typeof LISTING_EVENT_TYPES)[number];

/** SyncJob — one bulk/fan-out operation (4.5/4.8); SyncJobItem — one
 * (listing x channel) unit of work within it (prompt.md's `SyncJob ───
 * SyncJobItem (status, attempts, lastError, payloadHash)`). */
export const SYNC_JOB_KINDS = ['PUBLISH', 'UNPUBLISH', 'REPRICE', 'RETAG', 'RESYNC', 'DELETE'] as const;
export type SyncJobKind = (typeof SYNC_JOB_KINDS)[number];

export const SYNC_JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

export const SYNC_JOB_ITEM_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DLQ'] as const;
export type SyncJobItemStatus = (typeof SYNC_JOB_ITEM_STATUSES)[number];

/** Export Pack lifecycle (4.12) — `GENERATED` (zip built) -> `DOWNLOADED`
 * (user fetched it, still real progress even before confirmation) ->
 * `CONFIRMED` (user says they uploaded it manually; `confirmedByUserAt` is
 * the source of truth the Listing state machine transitions on). */
export const EXPORT_PACK_STATUSES = ['GENERATED', 'DOWNLOADED', 'CONFIRMED'] as const;
export type ExportPackStatus = (typeof EXPORT_PACK_STATUSES)[number];

export const EXPORT_PACK_ITEM_KINDS = ['PRINT_FILE', 'MOCKUP', 'METADATA_CSV', 'FIELD_CARDS', 'CHECKLIST'] as const;
export type ExportPackItemKind = (typeof EXPORT_PACK_ITEM_KINDS)[number];

/** IP/trademark policy linter dictionary (4.11) — global (admin-editable, not
 * tenant-scoped, same reasoning as `ConnectorDefinition`: a banned-term
 * dictionary is a platform-wide policy fact). */
export const BANNED_TERM_CATEGORIES = ['TRADEMARK', 'IP', 'PROFANITY', 'OTHER'] as const;
export type BannedTermCategory = (typeof BANNED_TERM_CATEGORIES)[number];

export const BANNED_TERM_MATCH_TYPES = ['EXACT', 'FUZZY'] as const;
export type BannedTermMatchType = (typeof BANNED_TERM_MATCH_TYPES)[number];

export const BULK_ACTION_TYPES = ['PUBLISH', 'UNPUBLISH', 'REPRICE', 'RETAG', 'RESYNC', 'DELETE'] as const;
export type BulkActionType = (typeof BULK_ACTION_TYPES)[number];

/** Connector adapter error taxonomy (prompt.md Connector SDK `mapError`). */
export const CONNECTOR_ERROR_CODES = [
  'AUTH_EXPIRED',
  'AUTH_INVALID',
  'RATE_LIMITED',
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'PROVIDER_UNAVAILABLE',
  'MALFORMED_RESPONSE',
  'UNKNOWN',
] as const;
export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[number];

/** Phase 4.5 — minimal double-entry ledger primitive (prompt.md "CONSUMER MODE"
 * section / docs/points-extension.md §7.4). A `LedgerLine.amountMinor` is
 * always non-negative; `direction` carries the sign. */
export const LEDGER_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

// `LEDGER_ACCOUNT_CODES`/`LedgerAccountCode` were a 2-code stub here in Phase
// 4.5 ("points_liability", "sales_discounts" only). Phase 6 owns the real
// chart of accounts and the single, now-generalised declaration lives further
// below (search "Phase 6 — Finance, Ledger & Tax") — it still includes both
// original codes, so every Phase 4.5 posting stays valid unchanged.

/** Fraud signal codes (docs/points-extension.md §8.1) recorded on
 * `VideoWatch.fraudSignals` and shown, translated, in the admin fraud queue
 * (§10.3) — the *codes* are stable identifiers; the client never sees more
 * than "WATCH_FRAUD_SUSPECT" (§9.5), only admins see the signal breakdown. */
export const FRAUD_SIGNAL_CODES = [
  'HEARTBEAT_GAP_EXCEEDED',
  'WATCH_POSITION_ACCELERATION',
  'WATCH_SECONDS_OVERFLOW',
  'CONCURRENT_SESSIONS',
  'IP_DEVICE_FANOUT',
  'LOW_HEARTBEAT_COVERAGE',
] as const;
export type FraudSignalCode = (typeof FRAUD_SIGNAL_CODES)[number];

/** Mandatory reason codes for a manual `ADJUST` point transaction (§10.3's
 * "Point adjustment tool" / §16's DoD) and for a fraud-queue rejection note. */
export const POINT_ADJUST_REASON_CODES = [
  'GOODWILL',
  'SUPPORT_CORRECTION',
  'FRAUD_CLAWBACK',
  'PROMOTION',
  'OTHER',
] as const;
export type PointAdjustReasonCode = (typeof POINT_ADJUST_REASON_CODES)[number];

// ---------------------------------------------------------------------------
// Phase 5 — Orders, Fulfilment & Digital Delivery (featureslist.md §6/§7,
// implentationplanphase.md tasks 5.1-5.13)
// ---------------------------------------------------------------------------

/** Order status machine — EXACTLY implentationplanphase.md's Phase 5 entry:
 * `NEW -> CONFIRMED -> IN_PRODUCTION -> SHIPPED -> DELIVERED -> CLOSED` plus
 * three side-states reachable from most points in the happy path
 * (`CANCELLED` / `REFUNDED` / `ON_HOLD`), matching featureslist.md 6.3
 * verbatim. `OrderStatusMachine` (apps/api/src/orders) is the one place that
 * enforces which transitions are legal — this tuple is just the vocabulary. */
export const ORDER_STATUSES = [
  'NEW',
  'CONFIRMED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
  'REFUNDED',
  'ON_HOLD',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** How this Order row entered OmniSell (task 5.1). `manual` covers orders
 * created directly in OmniSell (no connector), e.g. a digital-only sale. */
export const ORDER_INGEST_SOURCES = ['webhook', 'poll', 'manual'] as const;
export type OrderIngestSource = (typeof ORDER_INGEST_SOURCES)[number];

/** Exception taxonomy — EXACTLY featureslist.md 6.7's five named types. */
export const ORDER_EXCEPTION_TYPES = [
  'ADDRESS_INVALID',
  'OUT_OF_STOCK',
  'PRINT_REJECT',
  'PAYMENT_HOLD',
  'CUSTOMS',
] as const;
export type OrderExceptionType = (typeof ORDER_EXCEPTION_TYPES)[number];

export const ORDER_EXCEPTION_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED'] as const;
export type OrderExceptionStatus = (typeof ORDER_EXCEPTION_STATUSES)[number];

/** Activity timeline event kinds (mirrors `LISTING_EVENT_TYPES`'s pattern). */
export const ORDER_EVENT_TYPES = [
  'STATUS_CHANGE',
  'INGESTED',
  'EXCEPTION_OPENED',
  'EXCEPTION_RESOLVED',
  'SLA_BREACHED',
  'FULFILMENT_SUBMITTED',
  'FULFILMENT_FAILED',
  'SHIPMENT_UPDATED',
  'RETURN_REQUESTED',
  'REFUND_ISSUED',
  'REPRINT_REQUESTED',
  'MESSAGE_SENT',
  'HOLD',
  'RELEASE',
  'CANCELLED',
  'COMMENT',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const FULFILMENT_STATUSES = [
  'PENDING',
  'SUBMITTED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

/** Auto-routing strategies (featureslist.md 6.4). `MANUAL` records that a
 * human picked the provider — `FulfilmentRoutingRule` never applies. */
export const ROUTING_STRATEGIES = ['CHEAPEST', 'FASTEST', 'BY_REGION', 'BY_STOCK_PROVIDER', 'MANUAL'] as const;
export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export const SHIPMENT_STATUSES = [
  'LABEL_CREATED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'RETURNED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const ORDER_FEE_TYPES = ['COMMISSION', 'PAYMENT_PROCESSING', 'SHIPPING', 'TAX', 'PRINT_COST', 'OTHER'] as const;
export type OrderFeeType = (typeof ORDER_FEE_TYPES)[number];

export const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'COMPLETED'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const REFUND_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REPRINT_STATUSES = ['REQUESTED', 'APPROVED', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'REJECTED'] as const;
export type ReprintStatus = (typeof REPRINT_STATUSES)[number];

/** Buyer message templates (featureslist.md 6.10) — exactly the three named kinds. */
export const BUYER_MESSAGE_TYPES = ['SHIPPING_DELAY', 'THANK_YOU', 'REVIEW_REQUEST'] as const;
export type BuyerMessageType = (typeof BUYER_MESSAGE_TYPES)[number];

/** Digital Products (featureslist.md §7). */
export const ENTITLEMENT_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const DELIVERY_LOG_ACTIONS = ['ISSUED', 'DOWNLOADED', 'RESENT', 'DENIED'] as const;
export type DeliveryLogAction = (typeof DELIVERY_LOG_ACTIONS)[number];

/** Reason a `DeliveryToken` redemption was denied (recorded on `DeliveryLog.reason`
 * when `action === 'DENIED'`) — the client only ever sees a generic 403/410 problem
 * detail; this is the admin-visible breakdown, same pattern as `FRAUD_SIGNAL_CODES`. */
export const DELIVERY_DENIAL_REASONS = ['EXPIRED', 'DOWNLOAD_CAP_REACHED', 'IP_MISMATCH', 'REVOKED', 'ENTITLEMENT_REVOKED'] as const;
export type DeliveryDenialReason = (typeof DELIVERY_DENIAL_REASONS)[number];

export const LICENCE_KEY_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type LicenceKeyStatus = (typeof LICENCE_KEY_STATUSES)[number];

export const COUPON_TYPES = ['PERCENT', 'FIXED', 'BOGO'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

// ---------------------------------------------------------------------------
// Phase 6 — Finance, Ledger & Tax (implentationplanphase.md tasks 6.1-6.11,
// featureslist.md §9). Extends the Phase 4.5 chart of accounts above rather
// than replacing it — `points_liability`/`sales_discounts` stay valid codes.
// ---------------------------------------------------------------------------

/** Real chart of accounts this phase posts to (docs/phases/PHASE_6_REPORT.md
 * documents the exact double-entry shape of every posting helper in
 * `packages/shared/src/ledger-postings.ts`). Intentionally a flat list of
 * string codes (matching every other enum in this file), not a full ledger
 * hierarchy (parent/child accounts, statement grouping) — see
 * docs/OPEN_QUESTIONS.md for why a flat chart was chosen for this phase. */
export const LEDGER_ACCOUNT_CODES = [
  'points_liability',
  'sales_discounts',
  'accounts_receivable',
  'sales_revenue',
  'shipping_revenue',
  'tax_payable',
  'platform_commission_expense',
  'payment_processing_expense',
  'print_cost_expense',
  'shipping_expense',
  'tax_remittance_expense',
  'other_operating_expense',
  'fx_gain',
  'fx_loss',
  'cash',
  'accounts_payable',
  'operating_expenses',
] as const;
export type LedgerAccountCode = (typeof LEDGER_ACCOUNT_CODES)[number];

/** Maps `ORDER_FEE_TYPES` (Phase 5) to the expense account each fee type
 * decomposes into (task 6.2). `TAX` here means a marketplace-withheld/remitted
 * tax fee row, not the buyer-facing tax on the order itself (that's
 * `tax_payable`, credited at order-recognition time). */
export const ORDER_FEE_TYPE_TO_LEDGER_ACCOUNT: Record<(typeof ORDER_FEE_TYPES)[number], (typeof LEDGER_ACCOUNT_CODES)[number]> = {
  COMMISSION: 'platform_commission_expense',
  PAYMENT_PROCESSING: 'payment_processing_expense',
  SHIPPING: 'shipping_expense',
  TAX: 'tax_remittance_expense',
  PRINT_COST: 'print_cost_expense',
  OTHER: 'other_operating_expense',
};

/** Mandatory reason codes for a manual ledger correction (task 6.11 — "ledger
 * corrections with mandatory reason code"), mirroring the existing
 * `POINT_ADJUST_REASON_CODES` pattern above. */
export const LEDGER_CORRECTION_REASON_CODES = [
  'DATA_ENTRY_ERROR',
  'RECONCILIATION_ADJUSTMENT',
  'AUDITOR_REQUESTED',
  'PERIOD_CLOSE_TRUE_UP',
  'OTHER',
] as const;
export type LedgerCorrectionReasonCode = (typeof LEDGER_CORRECTION_REASON_CODES)[number];

export const EXPENSE_CATEGORIES = [
  'SOFTWARE',
  'ADVERTISING',
  'SHIPPING_SUPPLIES',
  'CONTRACTOR',
  'OFFICE',
  'PROFESSIONAL_FEES',
  'TRAVEL',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** Honest OCR status — 'UNAVAILABLE' is the real, non-fabricated default in
 * this sandbox (docs/DEBT.md); never a fake extracted-text result. */
export const OCR_STATUSES = ['UNAVAILABLE', 'PENDING', 'COMPLETED', 'FAILED'] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

export const FINANCE_PAYOUT_STATUSES = ['EXPECTED', 'RECEIVED', 'RECONCILED', 'VARIANCE_FLAGGED'] as const;
export type FinancePayoutStatus = (typeof FINANCE_PAYOUT_STATUSES)[number];

export const RECONCILIATION_VARIANCE_STATUSES = ['PENDING', 'MATCHED', 'MINOR_VARIANCE', 'MAJOR_VARIANCE', 'DISPUTED'] as const;
export type ReconciliationVarianceStatus = (typeof RECONCILIATION_VARIANCE_STATUSES)[number];

/** Variance threshold this phase's exit criterion is graded against ("fee
 * decomposition matches provider statements within ±0.5%"). A variance whose
 * absolute percentage of expected exceeds this is `MAJOR_VARIANCE`; within it
 * but non-zero is `MINOR_VARIANCE`; exactly zero is `MATCHED`. */
export const RECONCILIATION_MAJOR_VARIANCE_PCT = 0.5;

export const INVOICE_TYPES = ['STANDARD', 'SIMPLIFIED', 'CREDIT_NOTE'] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** ZATCA Phase-2 clearance/reporting lifecycle (task 6.8). `CLEARED`/`REPORTED`
 * would only ever be reached by a real call to ZATCA's clearance/reporting
 * API, which this sandbox cannot make (no live ZATCA onboarding/CSID — see
 * docs/DEBT.md); every invoice generated here stops at `NOT_SUBMITTED`. */
export const ZATCA_CLEARANCE_STATUSES = ['NOT_SUBMITTED', 'CLEARED', 'REPORTED', 'REJECTED'] as const;
export type ZatcaClearanceStatus = (typeof ZATCA_CLEARANCE_STATUSES)[number];

export const TAX_JURISDICTION_TYPES = ['US_STATE', 'GCC_VAT', 'EU_OSS'] as const;
export type TaxJurisdictionType = (typeof TAX_JURISDICTION_TYPES)[number];

export const PERIOD_LOCK_STATUSES = ['OPEN', 'LOCKED'] as const;
export type PeriodLockStatus = (typeof PERIOD_LOCK_STATUSES)[number];

export const DISPUTE_STATUSES = ['OPEN', 'RESOLVED', 'REJECTED'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const ACCOUNTING_EXPORT_FORMATS = ['CSV', 'QUICKBOOKS_IIF', 'XERO_CSV', 'ZOHO_CSV'] as const;
export type AccountingExportFormat = (typeof ACCOUNTING_EXPORT_FORMATS)[number];

export const PLAN_INTERVALS = ['MONTH', 'YEAR'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

/** Stripe Billing subscription lifecycle — the literal values Stripe's own
 * `Subscription.status` enum uses (confirmed via Stripe's public API docs,
 * see docs/CONNECTORS.md/docs/DEBT.md), so a webhook's `status` field maps
 * onto this type with no translation layer. */
export const SUBSCRIPTION_STATUSES = [
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'UNPAID',
  'PAUSED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const USAGE_RECORD_KINDS = ['AI_CREDIT', 'API_CALL', 'STORAGE_GB'] as const;
export type UsageRecordKind = (typeof USAGE_RECORD_KINDS)[number];

export const AI_CREDIT_LEDGER_REASONS = ['PLAN_GRANT', 'TOPUP_PURCHASE', 'AI_COPY_SPEND', 'AI_TAG_SPEND', 'AI_TRANSLATE_SPEND', 'AI_BG_REMOVE_SPEND', 'AI_UPSCALE_SPEND', 'ADMIN_ADJUSTMENT'] as const;
export type AiCreditLedgerReason = (typeof AI_CREDIT_LEDGER_REASONS)[number];