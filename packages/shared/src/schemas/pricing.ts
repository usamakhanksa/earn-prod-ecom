import { z } from 'zod';
import { PRICING_METHODS, ROUNDING_MODES } from '../enums';
import { currencyCodeSchema } from '../money';

/**
 * Pricing rules engine + margin preview (featureslist.md 3.6/3.7,
 * implentationplanphase.md tasks 2.9/2.11). The engines themselves
 * (apps/api/src/catalog/pricing/{pricing,margin}.engine.ts) are pure — these
 * are the shared configuration + request/response shapes.
 */

const minorStringSchema = z.string().regex(/^\d+$/, 'Minor-unit integer required');

export const createPricingRuleSchema = z
  .object({
    name: z.string().min(1).max(120),
    method: z.enum(PRICING_METHODS),
    costPlusPct: z.number().min(0).max(1000).optional(),
    fixedMarginPct: z.number().min(0).max(99).optional(),
    targetPriceMinor: minorStringSchema.optional(),
    roundingMode: z.enum(ROUNDING_MODES).default('NONE'),
    channelMultipliers: z.record(z.string(), z.number().positive()).optional(),
    currencyFloors: z.record(z.string(), minorStringSchema).optional(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (rule) =>
      (rule.method === 'COST_PLUS_PERCENT' && rule.costPlusPct !== undefined) ||
      (rule.method === 'FIXED_MARGIN' && rule.fixedMarginPct !== undefined) ||
      (rule.method === 'TARGET_PRICE' && rule.targetPriceMinor !== undefined),
    { message: 'The field matching the chosen pricing method is required' },
  );
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  costPlusPct: z.number().min(0).max(1000).optional(),
  fixedMarginPct: z.number().min(0).max(99).optional(),
  targetPriceMinor: minorStringSchema.optional(),
  roundingMode: z.enum(ROUNDING_MODES).optional(),
  channelMultipliers: z.record(z.string(), z.number().positive()).optional(),
  currencyFloors: z.record(z.string(), minorStringSchema).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

export interface PricingRuleSummary {
  id: string;
  name: string;
  method: string;
  costPlusPct: number | null;
  fixedMarginPct: number | null;
  targetPriceMinor: string | null;
  roundingMode: string;
  channelMultipliers: Record<string, number> | null;
  currencyFloors: Record<string, string> | null;
  isActive: boolean;
}

/** Margin preview / waterfall (3.7 + signature moment #1). All inputs and
 * outputs are minor-unit strings — never a float across the wire. */
export const marginPreviewSchema = z.object({
  baseCostMinor: minorStringSchema,
  priceMinor: minorStringSchema,
  currency: currencyCodeSchema,
  channel: z.string().min(1).max(60).default('default'),
  pricingRuleId: z.string().min(1).optional(),
  channelFeePct: z.number().min(0).max(100).default(0),
  channelFeeFixedMinor: minorStringSchema.default('0'),
  shippingMinor: minorStringSchema.default('0'),
  taxPct: z.number().min(0).max(100).default(0),
});
export type MarginPreviewInput = z.infer<typeof marginPreviewSchema>;

export interface MarginWaterfallStep {
  key: 'gross' | 'fees' | 'print' | 'shipping' | 'tax' | 'net';
  labelKey: string;
  amountMinor: string;
}

export interface MarginPreviewResult {
  currency: string;
  grossMinor: string;
  feesMinor: string;
  printCostMinor: string;
  shippingMinor: string;
  taxMinor: string;
  netMinor: string;
  marginPct: number;
  waterfall: MarginWaterfallStep[];
}

/** Applies a saved PricingRule to a base cost — used by the product builder's
 * live price field before the user commits a price. */
export const applyPricingRuleSchema = z.object({
  pricingRuleId: z.string().min(1),
  baseCostMinor: minorStringSchema,
  currency: currencyCodeSchema,
  channel: z.string().min(1).max(60).default('default'),
});
export type ApplyPricingRuleInput = z.infer<typeof applyPricingRuleSchema>;

export interface ApplyPricingRuleResult {
  priceMinor: string;
  currency: string;
  marginPct: number;
}
