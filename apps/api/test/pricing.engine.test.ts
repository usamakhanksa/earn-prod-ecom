import { describe, expect, it } from 'vitest';
import { applyRounding, computeBasePrice, computePrice, type PricingRuleConfig } from '../src/catalog/pricing/pricing.engine';

describe('computeBasePrice', () => {
  it('COST_PLUS_PERCENT marks the cost up', () => {
    const rule: PricingRuleConfig = { method: 'COST_PLUS_PERCENT', costPlusPct: 40, roundingMode: 'NONE' };
    expect(computeBasePrice(rule, 1000n)).toBe(1400n);
  });

  it('FIXED_MARGIN computes the price whose margin equals the target', () => {
    const rule: PricingRuleConfig = { method: 'FIXED_MARGIN', fixedMarginPct: 50, roundingMode: 'NONE' };
    expect(computeBasePrice(rule, 1000n)).toBe(2000n);
  });

  it('TARGET_PRICE returns the configured price verbatim', () => {
    const rule: PricingRuleConfig = { method: 'TARGET_PRICE', targetPriceMinor: 2500n, roundingMode: 'NONE' };
    expect(computeBasePrice(rule, 1000n)).toBe(2500n);
  });

  it('throws when the field matching the method is missing (COST_PLUS_PERCENT)', () => {
    const rule = { method: 'COST_PLUS_PERCENT', roundingMode: 'NONE' } as PricingRuleConfig;
    expect(() => computeBasePrice(rule, 1000n)).toThrow(/costPlusPct/);
  });

  it('throws when the field matching the method is missing (FIXED_MARGIN)', () => {
    const rule = { method: 'FIXED_MARGIN', roundingMode: 'NONE' } as PricingRuleConfig;
    expect(() => computeBasePrice(rule, 1000n)).toThrow(/fixedMarginPct/);
  });

  it('throws when the field matching the method is missing (TARGET_PRICE)', () => {
    const rule = { method: 'TARGET_PRICE', roundingMode: 'NONE' } as PricingRuleConfig;
    expect(() => computeBasePrice(rule, 1000n)).toThrow(/targetPriceMinor/);
  });
});

describe('applyRounding', () => {
  it('NONE leaves the price untouched', () => {
    expect(applyRounding(1234n, 'NONE')).toBe(1234n);
  });

  it('PSYCHOLOGICAL_99 rounds to the nearest .99', () => {
    expect(applyRounding(1234n, 'PSYCHOLOGICAL_99')).toBe(1299n);
  });

  it('NEAREST_INTEGER rounds to the nearest whole currency unit', () => {
    expect(applyRounding(1250n, 'NEAREST_INTEGER')).toBe(1300n); // 12.50 -> 13.00 (half rounds up)
    expect(applyRounding(1249n, 'NEAREST_INTEGER')).toBe(1200n);
  });

  it('NEAREST_5 rounds to the nearest 5 minor units', () => {
    expect(applyRounding(1223n, 'NEAREST_5')).toBe(1225n);
    expect(applyRounding(1222n, 'NEAREST_5')).toBe(1220n);
  });
});

describe('computePrice — full composition', () => {
  const baseRule: PricingRuleConfig = { method: 'COST_PLUS_PERCENT', costPlusPct: 100, roundingMode: 'NONE' };

  it('applies base method with no channel/currency configuration', () => {
    expect(computePrice(baseRule, 1000n, { currency: 'USD' })).toBe(2000n);
  });

  it('applies a per-channel multiplier when the channel matches', () => {
    const rule: PricingRuleConfig = { ...baseRule, channelMultipliers: { etsy: 1.1 } };
    expect(computePrice(rule, 1000n, { currency: 'USD', channel: 'etsy' })).toBe(2200n);
  });

  it('ignores the multiplier map for a channel with no configured entry', () => {
    const rule: PricingRuleConfig = { ...baseRule, channelMultipliers: { etsy: 1.1 } };
    expect(computePrice(rule, 1000n, { currency: 'USD', channel: 'shopify' })).toBe(2000n);
  });

  it('rounds after the multiplier, then applies the currency floor last', () => {
    const rule: PricingRuleConfig = {
      ...baseRule,
      roundingMode: 'PSYCHOLOGICAL_99',
      currencyFloors: { USD: 5000n },
    };
    // base 2000 -> rounded 1999 (BELOW the 5000 floor) -> floored to 5000
    expect(computePrice(rule, 1000n, { currency: 'USD' })).toBe(5000n);
  });

  it('leaves a price above the floor untouched', () => {
    const rule: PricingRuleConfig = { ...baseRule, currencyFloors: { USD: 500n } };
    expect(computePrice(rule, 1000n, { currency: 'USD' })).toBe(2000n);
  });

  it('applies no floor for a currency with none configured', () => {
    const rule: PricingRuleConfig = { ...baseRule, currencyFloors: { EUR: 999999n } };
    expect(computePrice(rule, 1000n, { currency: 'USD' })).toBe(2000n);
  });
});
