import { describe, expect, it } from 'vitest';
import { computeMargin, toWaterfallSteps } from '../src/catalog/margin/margin.engine';

describe('computeMargin', () => {
  it('computes a full decomposition with fees, print cost, shipping, and tax', () => {
    const result = computeMargin({
      baseCostMinor: 1000n, // $10 print cost
      priceMinor: 5000n, // $50 gross
      channelFeePct: 10, // $5 fee
      channelFeeFixedMinor: 30n, // $0.30 fixed fee
      shippingMinor: 500n, // $5 shipping
      taxPct: 15, // $7.50 tax
    });

    expect(result.grossMinor).toBe(5000n);
    expect(result.feesMinor).toBe(530n); // 500 (10%) + 30 fixed
    expect(result.printCostMinor).toBe(1000n);
    expect(result.shippingMinor).toBe(500n);
    expect(result.taxMinor).toBe(750n); // 15% of 5000
    // net = 5000 - 530 - 1000 - 500 - 750 = 2220
    expect(result.netMinor).toBe(2220n);
    expect(result.marginPct).toBeCloseTo(44.4, 1);
  });

  it('defaults every optional deduction to zero', () => {
    const result = computeMargin({ baseCostMinor: 1000n, priceMinor: 3000n });
    expect(result.feesMinor).toBe(0n);
    expect(result.shippingMinor).toBe(0n);
    expect(result.taxMinor).toBe(0n);
    expect(result.netMinor).toBe(2000n);
    expect(result.marginPct).toBeCloseTo(66.67, 1);
  });

  it('clamps net to zero rather than going negative when deductions exceed gross', () => {
    const result = computeMargin({ baseCostMinor: 4000n, priceMinor: 3000n, shippingMinor: 1000n });
    expect(result.netMinor).toBe(0n);
    expect(result.marginPct).toBeLessThan(0); // margin % still reports the real (negative) figure
  });

  it('reports 0% margin for a non-positive gross price rather than dividing by zero', () => {
    const result = computeMargin({ baseCostMinor: 1000n, priceMinor: 0n });
    expect(result.marginPct).toBe(0);
    expect(result.netMinor).toBe(0n);
  });
});

describe('toWaterfallSteps', () => {
  it('renders gross -> fees -> print -> shipping -> tax -> net, deductions negative', () => {
    const result = computeMargin({
      baseCostMinor: 1000n,
      priceMinor: 5000n,
      channelFeePct: 10,
      shippingMinor: 500n,
      taxPct: 10,
    });
    const steps = toWaterfallSteps(result);
    expect(steps.map((s) => s.key)).toEqual(['gross', 'fees', 'print', 'shipping', 'tax', 'net']);
    expect(steps[0]?.amountMinor).toBe(5000n);
    expect(steps[1]?.amountMinor).toBeLessThanOrEqual(0n);
    expect(steps[2]?.amountMinor).toBeLessThanOrEqual(0n);
    expect(steps[3]?.amountMinor).toBeLessThanOrEqual(0n);
    expect(steps[4]?.amountMinor).toBeLessThanOrEqual(0n);
    expect(steps[5]?.amountMinor).toBe(result.netMinor);
  });
});
