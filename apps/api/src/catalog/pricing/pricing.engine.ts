import {
  applyCurrencyFloor,
  priceForCostPlus,
  priceForFixedMargin,
  roundPsychological99,
  roundToNearestMinor,
  scaleMinor,
  type PricingMethod,
  type RoundingMode,
} from '@omnisell/shared';

/**
 * Pricing rules engine (featureslist.md 3.6, implentationplanphase.md task
 * 2.9). Pure, synchronous — no infra dependency. Composition order matches
 * the UI's mental model: base method -> per-channel multiplier -> rounding ->
 * per-currency floor, applied in that fixed sequence every time.
 */
export interface PricingRuleConfig {
  method: PricingMethod;
  costPlusPct?: number | undefined;
  fixedMarginPct?: number | undefined;
  targetPriceMinor?: bigint | undefined;
  roundingMode: RoundingMode;
  channelMultipliers?: Record<string, number> | undefined;
  currencyFloors?: Record<string, bigint> | undefined;
}

export interface ComputePriceOptions {
  currency: string;
  channel?: string;
}

export function computeBasePrice(rule: PricingRuleConfig, costMinor: bigint): bigint {
  switch (rule.method) {
    case 'COST_PLUS_PERCENT':
      if (rule.costPlusPct === undefined) {
        throw new Error('costPlusPct is required for the COST_PLUS_PERCENT method');
      }
      return priceForCostPlus(costMinor, rule.costPlusPct);
    case 'FIXED_MARGIN':
      if (rule.fixedMarginPct === undefined) {
        throw new Error('fixedMarginPct is required for the FIXED_MARGIN method');
      }
      return priceForFixedMargin(costMinor, rule.fixedMarginPct);
    case 'TARGET_PRICE':
      if (rule.targetPriceMinor === undefined) {
        throw new Error('targetPriceMinor is required for the TARGET_PRICE method');
      }
      return rule.targetPriceMinor;
  }
}

export function applyRounding(priceMinor: bigint, mode: RoundingMode, minorUnitsPerMajor = 100n): bigint {
  switch (mode) {
    case 'NONE':
      return priceMinor;
    case 'PSYCHOLOGICAL_99':
      return roundPsychological99(priceMinor, minorUnitsPerMajor);
    case 'NEAREST_INTEGER':
      return roundToNearestMinor(priceMinor, minorUnitsPerMajor);
    case 'NEAREST_5':
      return roundToNearestMinor(priceMinor, 5n);
  }
}

/**
 * Full composition: base method -> channel multiplier -> rounding -> currency
 * floor. `opts.channel` looks up `rule.channelMultipliers[channel]` — absent
 * means no multiplier for that channel (1x), not an error.
 */
export function computePrice(rule: PricingRuleConfig, costMinor: bigint, opts: ComputePriceOptions): bigint {
  let price = computeBasePrice(rule, costMinor);

  const multiplier = opts.channel !== undefined ? rule.channelMultipliers?.[opts.channel] : undefined;
  if (multiplier !== undefined) {
    price = scaleMinor(price, multiplier);
  }

  price = applyRounding(price, rule.roundingMode);

  const floor = rule.currencyFloors?.[opts.currency];
  price = applyCurrencyFloor(price, floor);

  return price;
}
