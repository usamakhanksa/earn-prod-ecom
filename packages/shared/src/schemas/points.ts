import { z } from 'zod';
import {
  POINT_TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  WATCH_STATUSES,
  POINT_ADJUST_REASON_CODES,
} from '../enums';
import { currencyCodeSchema } from '../money';

/**
 * Consumer points & wallet — request/response shapes (docs/points-extension.md
 * §6/§9). Points travel the wire as digit strings (same "never a float, never
 * a bare JS number for money-shaped values" pattern `packages/shared/src/money.ts`
 * already uses for `AmountMinor`) OR a non-negative integer JS number for
 * ergonomic client call-sites (a slider, a form) — both are accepted on input
 * and normalised to `bigint` server-side; every RESPONSE field is always a
 * string so a 2^53+ balance never silently loses precision in a JS client.
 */
const pointsInputSchema = z
  .union([z.string().regex(/^\d+$/, 'Points must be a non-negative integer'), z.number().int().nonnegative()])
  .transform((value) => BigInt(value));

export function pointsToWire(value: bigint): string {
  return value.toString();
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export interface WalletView {
  balance: string;
  todayEarned: string;
  todayCapped: boolean;
  lifetimeEarned: string;
  lifetimeSpent: string;
  nextExpiry: { at: string; amount: string } | null;
}

export const walletTransactionsQuerySchema = z.object({
  type: z.enum(POINT_TRANSACTION_TYPES).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type WalletTransactionsQuery = z.infer<typeof walletTransactionsQuerySchema>;

export interface PointTransactionView {
  id: string;
  type: (typeof POINT_TRANSACTION_TYPES)[number];
  amount: string;
  source: string;
  sourceId: string | null;
  status: (typeof TRANSACTION_STATUSES)[number];
  validatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface WalletTransactionsPage {
  items: PointTransactionView[];
  nextCursor: string | null;
}

export const earnVideoWatchAliasSchema = z.object({
  videoId: z.string().min(1),
  watchSeconds: z.number().int().nonnegative(),
  heartbeatLog: z.array(z.object({ timestamp: z.string().datetime(), watchPosition: z.number().int().nonnegative() })).default([]),
});
export type EarnVideoWatchAliasInput = z.infer<typeof earnVideoWatchAliasSchema>;

export interface EarningRuleView {
  id: string;
  action: string;
  points: number;
  minWatchSeconds: number | null;
  maxDailyCap: number | null;
  cooldownSeconds: number | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Video content (admin/creator CRUD, §9.4)
// ---------------------------------------------------------------------------

/**
 * `durationSeconds` is deliberately ABSENT here — docs/points-extension.md
 * §9.4 requires it come from "a server-side probe ... never the client's
 * claim". Exactly one of `url` (an external, already-hosted video the
 * server fetches and probes) or `uploadSessionId` (bytes already landed on
 * this API's own resumable-upload scratch storage, reused as-is per Phase 2
 * — see `VideoContentService`) must be given.
 */
export const createVideoContentSchema = z
  .object({
    title: z.string().min(1).max(200),
    url: z.string().url().optional(),
    uploadSessionId: z.string().min(1).optional(),
    thumbnailUrl: z.string().url().optional(),
    pointsPerView: z.number().int().positive().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => (v.url !== undefined) !== (v.uploadSessionId !== undefined), {
    message: 'Provide exactly one of "url" or "uploadSessionId"',
  });
export type CreateVideoContentInput = z.infer<typeof createVideoContentSchema>;

export const updateVideoContentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  pointsPerView: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateVideoContentInput = z.infer<typeof updateVideoContentSchema>;

export interface VideoContentView {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  pointsPerView: number | null;
  resolvedPointsPerView: number; // after rule-resolution (§7.1) — 0 means "hidden opportunity"
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Video watch pipeline (§9.2, internal/strict)
// ---------------------------------------------------------------------------

export const startVideoWatchSchema = z.object({
  videoId: z.string().min(1),
  deviceFingerprint: z.string().max(128).optional(),
});
export type StartVideoWatchInput = z.infer<typeof startVideoWatchSchema>;

export interface StartVideoWatchResult {
  watchId: string;
  heartbeatsMs: number;
}

export const videoWatchHeartbeatSchema = z.object({
  timestamp: z.string().datetime(), // clientClock — logged for drift only, never credited (§4)
  watchPosition: z.number().int().nonnegative(),
});
export type VideoWatchHeartbeatInput = z.infer<typeof videoWatchHeartbeatSchema>;

export interface VideoWatchHeartbeatResult {
  verifiedSeconds: number;
}

export const completeVideoWatchSchema = z.object({
  finalHeartbeat: videoWatchHeartbeatSchema.optional(),
});
export type CompleteVideoWatchInput = z.infer<typeof completeVideoWatchSchema>;

export interface CompleteVideoWatchResult {
  earnedPoints: string | null;
  status: (typeof WATCH_STATUSES)[number];
}

// ---------------------------------------------------------------------------
// Redemption (§9.3 / §7.4)
// ---------------------------------------------------------------------------

export const redeemPreviewSchema = z.object({
  productId: z.string().min(1),
  pointsToUse: pointsInputSchema,
  // Phase 5: when set, the discount is computed against the real Order's
  // multi-item subtotal instead of the single product's own price.
  orderId: z.string().min(1).nullable().optional(),
});
export type RedeemPreviewInput = z.infer<typeof redeemPreviewSchema>;

export interface RedeemPreviewResult {
  discountCurrencyMinor: string;
  subtotalMinor: string;
  afterDiscountMinor: string;
  currency: string;
}

export const redeemConfirmSchema = z.object({
  // Nullable: a redemption can still be confirmed before an Order row exists
  // (docs/DEBT.md 4.5-D6 closed this pass — Order now exists; this stays
  // nullable for the still-valid "no order yet" checkout path).
  orderId: z.string().min(1).nullable(),
  productId: z.string().min(1),
  pointsToUse: pointsInputSchema,
});
export type RedeemConfirmInput = z.infer<typeof redeemConfirmSchema>;

export interface RedeemConfirmResult {
  discountCurrencyMinor: string;
  balanceAfter: string;
  purchaseId: string;
}

export const redeemRefundSchema = z.object({
  purchaseId: z.string().min(1),
});
export type RedeemRefundInput = z.infer<typeof redeemRefundSchema>;

// ---------------------------------------------------------------------------
// Admin — rules, settings, fraud review, adjustment (§10.3)
// ---------------------------------------------------------------------------

export const upsertEarningRuleSchema = z.object({
  action: z.string().min(1).max(80),
  points: z.number().int().positive(),
  minWatchSeconds: z.number().int().positive().nullable().optional(),
  maxDailyCap: z.number().int().positive().nullable().optional(),
  cooldownSeconds: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type UpsertEarningRuleInput = z.infer<typeof upsertEarningRuleSchema>;

export const updateTenantPointSettingsSchema = z.object({
  currencyCode: currencyCodeSchema.optional(),
  pointsPerCurrencyMinor: z.number().int().positive().optional(),
  minRedeemPoints: z.number().int().nonnegative().optional(),
  maxRedeemSharePct: z.number().int().min(0).max(100).optional(),
  autoExpireDays: z.number().int().positive().nullable().optional(),
  expiryReminderDays: z.number().int().positive().optional(),
  redemptionEnabled: z.boolean().optional(),
});
export type UpdateTenantPointSettingsInput = z.infer<typeof updateTenantPointSettingsSchema>;

export interface TenantPointSettingsView {
  currencyCode: string;
  pointsPerCurrencyMinor: number;
  minRedeemPoints: number;
  maxRedeemSharePct: number;
  autoExpireDays: number | null;
  expiryReminderDays: number;
  redemptionEnabled: boolean;
}

export const fraudReviewDecisionSchema = z.object({
  note: z.string().min(1).max(1000),
});
export type FraudReviewDecisionInput = z.infer<typeof fraudReviewDecisionSchema>;

export interface FraudQueueItemView {
  watchId: string;
  videoId: string;
  videoTitle: string;
  userId: string;
  signals: string[];
  watchSeconds: number;
  heartbeatCount: number;
  maxGapSeconds: number | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export const pointAdjustSchema = z.object({
  userId: z.string().min(1),
  amount: pointsInputSchema, // always positive magnitude; `sign` decides direction
  sign: z.enum(['CREDIT', 'DEBIT']),
  reasonCode: z.enum(POINT_ADJUST_REASON_CODES),
  note: z.string().min(1).max(500),
});
export type PointAdjustInput = z.infer<typeof pointAdjustSchema>;

export interface PointAdjustResult {
  transactionId: string;
  balanceAfter: string;
}

export { pointsInputSchema };
