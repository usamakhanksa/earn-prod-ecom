import { describe, expect, it } from 'vitest';
import { computeRealisedGainLoss, computeUnrealisedGainLoss, convertAtRate } from '../src/fx-math';

describe('convertAtRate', () => {
  it('converts a minor-unit amount using the quote rate', () => {
    const converted = convertAtRate(1_000n, { baseCurrency: 'USD', quoteCurrency: 'SAR', rate: 3.75, asOf: new Date('2026-01-01') });
    expect(converted).toBe(3_750n);
  });
});

describe('computeRealisedGainLoss', () => {
  it('is positive when the settled value exceeds the booked value (a gain)', () => {
    expect(computeRealisedGainLoss(1_000n, 1_050n)).toBe(50n);
  });

  it('is negative when the settled value is below the booked value (a loss)', () => {
    expect(computeRealisedGainLoss(1_000n, 950n)).toBe(-50n);
  });

  it('is zero when nothing moved', () => {
    expect(computeRealisedGainLoss(1_000n, 1_000n)).toBe(0n);
  });
});

describe('computeUnrealisedGainLoss', () => {
  it('revalues an open foreign-currency amount at the current rate vs. the booked rate', () => {
    // 1000 foreign-currency minor units, booked at 3.75, now worth 3.80
    const result = computeUnrealisedGainLoss(1_000n, 3.75, 3.8);
    expect(result).toBe(50n); // (3800 - 3750)
  });

  it('is a loss when the current rate is below the booked rate', () => {
    const result = computeUnrealisedGainLoss(1_000n, 3.75, 3.7);
    expect(result).toBe(-50n);
  });

  it('is zero when the rate has not moved', () => {
    expect(computeUnrealisedGainLoss(1_000n, 3.75, 3.75)).toBe(0n);
  });
});
