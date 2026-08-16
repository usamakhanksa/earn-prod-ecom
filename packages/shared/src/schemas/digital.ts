import { z } from 'zod';
import { COUPON_TYPES } from '../enums';
import { currencyCodeSchema } from '../money';

/** Digital Products (Phase 5 / featureslist.md §7). */

const minorStringSchema = z.string().regex(/^-?\d+$/, 'Minor-unit integer required');

export const createDigitalProductSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  productId: z.string().optional(),
});
export type CreateDigitalProductInput = z.infer<typeof createDigitalProductSchema>;

export const updateDigitalProductSchema = createDigitalProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateDigitalProductInput = z.infer<typeof updateDigitalProductSchema>;

export const createDigitalFileSchema = z.object({
  name: z.string().min(1).max(300),
});
export type CreateDigitalFileInput = z.infer<typeof createDigitalFileSchema>;

/** First version is uploaded through Phase 2's presigned/resumable pipeline;
 * this endpoint registers the resulting storage key as a new version
 * (task 5.10 — "file versions", reusing the base upload pipeline). */
export const createFileVersionSchema = z.object({
  version: z.string().min(1).max(40),
  storageKey: z.string().min(1),
  sizeBytes: z.string().regex(/^\d+$/).optional(),
  checksum: z.string().max(200).optional(),
});
export type CreateFileVersionInput = z.infer<typeof createFileVersionSchema>;

export const grantEntitlementSchema = z.object({
  digitalProductId: z.string().min(1),
  userId: z.string().optional(),
  buyerEmail: z.string().email().optional(),
  orderId: z.string().optional(),
  orderItemId: z.string().optional(),
});
export type GrantEntitlementInput = z.infer<typeof grantEntitlementSchema>;

/** Issues a fresh, time-limited, download-capped signed URL (task 5.10/7.2).
 * `digitalFileId` selects which file within the entitled DigitalProduct;
 * defaults to the current version. */
export const issueDeliverySchema = z.object({
  digitalFileId: z.string().min(1),
  ttlSeconds: z.coerce.number().int().min(60).max(7 * 24 * 3600).default(24 * 3600),
  maxDownloads: z.coerce.number().int().min(1).max(1000).default(5),
  allowedIp: z.string().max(64).optional(),
});
export type IssueDeliveryInput = z.infer<typeof issueDeliverySchema>;

export const resendDeliverySchema = z.object({
  digitalFileId: z.string().min(1),
});
export type ResendDeliveryInput = z.infer<typeof resendDeliverySchema>;

// --- Licence keys (7.3) ---

export const generateLicenceKeysSchema = z.object({
  digitalProductId: z.string().min(1),
  entitlementId: z.string().optional(),
  count: z.number().int().min(1).max(1000).default(1),
  pattern: z.string().min(1).max(80).default('XXXX-XXXX-XXXX-XXXX'), // X = random alnum
  activationLimit: z.number().int().min(1).max(1000).default(1),
});
export type GenerateLicenceKeysInput = z.infer<typeof generateLicenceKeysSchema>;

export const activateLicenceKeySchema = z.object({
  keyValue: z.string().min(1).max(120),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
});
export type ActivateLicenceKeyInput = z.infer<typeof activateLicenceKeySchema>;

export const deactivateLicenceKeySchema = z.object({
  keyValue: z.string().min(1).max(120),
  deviceId: z.string().min(1).max(200),
});
export type DeactivateLicenceKeyInput = z.infer<typeof deactivateLicenceKeySchema>;

// --- Coupons (7.6) ---

export const createCouponSchema = z
  .object({
    code: z.string().min(3).max(60),
    type: z.enum(COUPON_TYPES),
    valuePercent: z.number().int().min(1).max(100).optional(),
    valueMinor: minorStringSchema.optional(),
    currency: currencyCodeSchema.optional(),
    usageLimit: z.number().int().min(1).optional(),
    perCustomerLimit: z.number().int().min(1).optional(),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    channels: z.array(z.string().min(1)).default([]),
  })
  .refine((v) => v.type !== 'PERCENT' || v.valuePercent !== undefined, { message: 'valuePercent is required for a PERCENT coupon' })
  .refine((v) => v.type !== 'FIXED' || (v.valueMinor !== undefined && v.currency !== undefined), {
    message: 'valueMinor and currency are required for a FIXED coupon',
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z.object({
  usageLimit: z.number().int().min(1).optional(),
  perCustomerLimit: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export const redeemCouponSchema = z.object({
  code: z.string().min(1).max(60),
  orderId: z.string().optional(),
  buyerEmail: z.string().email().optional(),
  subtotalMinor: minorStringSchema,
  currency: currencyCodeSchema,
  connectorSlug: z.string().optional(),
});
export type RedeemCouponInput = z.infer<typeof redeemCouponSchema>;

// --- Response / view shapes ---

export interface DigitalFileVersionView {
  id: string;
  version: string;
  sizeBytes: string | null;
  checksum: string | null;
  isCurrent: boolean;
  createdAt: string;
}

export interface DigitalFileView {
  id: string;
  name: string;
  versions: DigitalFileVersionView[];
}

export interface DigitalProductView {
  id: string;
  name: string;
  description: string | null;
  productId: string | null;
  isActive: boolean;
  files: DigitalFileView[];
  createdAt: string;
}

export interface EntitlementView {
  id: string;
  userId: string | null;
  buyerEmail: string | null;
  digitalProductId: string;
  orderId: string | null;
  status: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface DeliveryIssueResult {
  url: string;
  expiresAt: string;
  maxDownloads: number;
}

export interface DeliveryLogView {
  id: string;
  entitlementId: string;
  digitalFileVersionId: string;
  action: string;
  ipAddress: string | null;
  reason: string | null;
  createdAt: string;
}

export interface LicenceKeyView {
  id: string;
  keyValue: string;
  digitalProductId: string;
  activationLimit: number;
  activationCount: number;
  status: string;
  createdAt: string;
}

export interface CouponView {
  id: string;
  code: string;
  type: string;
  valuePercent: number | null;
  valueMinor: string | null;
  currency: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  channels: string[];
  isActive: boolean;
}

export interface CouponRedeemResult {
  couponId: string;
  discountMinor: string;
  currency: string;
  redemptionId: string;
}
