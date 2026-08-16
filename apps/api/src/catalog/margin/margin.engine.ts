import { addMinor, applyPercent, clampNonNegative, marginPercentOf, subtractMinor } from '@omnisell/shared';

/**
 * Margin preview / waterfall engine (featureslist.md 3.7, prompt.md
 * "signature moment #1"). Pure, synchronous. Decomposes gross price into
 * fees, print cost, shipping, and tax, down to a net figure and a margin %,
 * in the exact order the waterfall chart renders (gross -> fees -> print ->
 * shipping -> tax -> net).
 */
export interface MarginInput {
  baseCostMinor: bigint;
  priceMinor: bigint;
  channelFeePct?: number;
  channelFeeFixedMinor?: bigint;
  shippingMinor?: bigint;
  taxPct?: number;
}

export interface MarginResult {
  grossMinor: bigint;
  feesMinor: bigint;
  printCostMinor: bigint;
  shippingMinor: bigint;
  taxMinor: bigint;
  netMinor: bigint;
  /** Margin % of NET over GROSS — 0 for a non-positive gross rather than NaN. */
  marginPct: number;
}

export function computeMargin(input: MarginInput): MarginResult {
  const gross = input.priceMinor;
  const feePct = applyPercent(gross, input.channelFeePct ?? 0);
  const feeFixed = input.channelFeeFixedMinor ?? 0n;
  const fees = addMinor(feePct, feeFixed);
  const printCost = input.baseCostMinor;
  const shipping = input.shippingMinor ?? 0n;
  const tax = applyPercent(gross, input.taxPct ?? 0);

  const totalDeductions = addMinor(addMinor(fees, printCost), addMinor(shipping, tax));
  const net = clampNonNegative(subtractMinor(gross, totalDeductions));
  const marginPct = marginPercentOf(gross, totalDeductions);

  return {
    grossMinor: gross,
    feesMinor: fees,
    printCostMinor: printCost,
    shippingMinor: shipping,
    taxMinor: tax,
    netMinor: net,
    marginPct,
  };
}

export interface WaterfallStepValue {
  key: 'gross' | 'fees' | 'print' | 'shipping' | 'tax' | 'net';
  amountMinor: bigint;
}

/** Waterfall bars in render order — negative steps are deductions, the final
 * bar is the net absolute value the chart lands on. */
export function toWaterfallSteps(result: MarginResult): WaterfallStepValue[] {
  return [
    { key: 'gross', amountMinor: result.grossMinor },
    { key: 'fees', amountMinor: -result.feesMinor },
    { key: 'print', amountMinor: -result.printCostMinor },
    { key: 'shipping', amountMinor: -result.shippingMinor },
    { key: 'tax', amountMinor: -result.taxMinor },
    { key: 'net', amountMinor: result.netMinor },
  ];
}
