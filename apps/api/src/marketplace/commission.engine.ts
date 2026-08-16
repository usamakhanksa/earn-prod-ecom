import type { CommissionRule } from '@prisma/client';

export interface CommissionContext {
  /** categoryId when the product belongs to a category */
  categoryId?: string | null;
  /** ISO country code of the sale */
  countryCode?: string;
  /** supplierId that owns the product */
  supplierId?: string | null;
  /** campaignId when the conversion came from a campaign link */
  campaignId?: string | null;
  /** product-level override set by the supplier */
  productCommissionPct?: number | null;
}

export interface ResolvedCommission {
  rateType: 'PERCENT' | 'FIXED';
  rateValue: number; // percent (0..100) or fixed minor units
  sourceScope: string; // which rule won
}

/**
 * Configurable commission engine (spec §19/§56). All rates come from the
 * `CommissionRule` table (admin/supplier editable) — nothing is hard-coded.
 *
 * Resolution priority (highest wins):
 *   CAMPAIGN > PRODUCT override > SUPPLIER > CATEGORY > COUNTRY > GLOBAL
 *
 * Deterministic and side-effect free so it can be unit-tested and audited.
 * The resolved rate is ALWAYS persisted to a commission row (never recomputed
 * and discarded) so "no computed total without stored components" holds.
 */
export function resolveCommission(
  rules: readonly CommissionRule[],
  ctx: CommissionContext,
): ResolvedCommission {
  const active = rules.filter((r) => r.isActive);

  const byScope = (scope: string, key?: string | null): CommissionRule | undefined => {
    if (key === undefined || key === null) return undefined;
    return active.find((r) => r.scope === scope && r.scopeKey === key);
  };

  const campaign = byScope('CAMPAIGN', ctx.campaignId);
  const productPct = ctx.productCommissionPct;
  const supplier = byScope('SUPPLIER', ctx.supplierId);
  const category = byScope('CATEGORY', ctx.categoryId);
  const country = byScope('COUNTRY', ctx.countryCode);
  const global = active.find((r) => r.scope === 'GLOBAL');

  // Priority: CAMPAIGN > PRODUCT override > SUPPLIER > CATEGORY > COUNTRY > GLOBAL
  if (campaign !== undefined) return toResolved(campaign);
  if (productPct !== undefined && productPct !== null) {
    return { rateType: 'PERCENT', rateValue: productPct, sourceScope: 'PRODUCT' };
  }
  if (supplier !== undefined) return toResolved(supplier);
  if (category !== undefined) return toResolved(category);
  if (country !== undefined) return toResolved(country);
  if (global !== undefined) return toResolved(global);

  // Safe default only reached when no GLOBAL rule exists (fresh install).
  return { rateType: 'PERCENT', rateValue: 0, sourceScope: 'NONE' };
}

function toResolved(c: CommissionRule): ResolvedCommission {
  return {
    rateType: c.rateType === 'FIXED' ? 'FIXED' : 'PERCENT',
    rateValue: Number(c.rateValue),
    sourceScope: c.scope,
  };
}

/**
 * Compute the commission amount in minor units for a given order total.
 * For PERCENT rates: floor(total * rate / 100). For FIXED rates: the stored
 * fixed amount (validated by the caller not to exceed the order total).
 */
export function computeCommissionAmount(
  orderTotalMinor: bigint,
  resolved: ResolvedCommission,
): bigint {
  if (resolved.rateType === 'FIXED') {
    const fixed = BigInt(Math.round(resolved.rateValue));
    return fixed > orderTotalMinor ? orderTotalMinor : fixed;
  }
  const pct = resolved.rateValue;
  if (pct <= 0) return 0n;
  return (orderTotalMinor * BigInt(Math.round(pct * 100))) / 10000n;
}