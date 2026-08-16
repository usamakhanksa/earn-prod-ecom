import { describe, expect, it } from 'vitest';
import {
  addMinor,
  applyCurrencyFloor,
  applyPercent,
  clampNonNegative,
  convertMinor,
  marginPercentOf,
  priceForCostPlus,
  priceForFixedMargin,
  roundPsychological99,
  roundToNearestMinor,
  scaleMinor,
  subtractMinor,
} from '../src/money-math';

describe('addMinor / subtractMinor', () => {
  it('adds and subtracts bigints exactly', () => {
    expect(addMinor(1000n, 250n)).toBe(1250n);
    expect(subtractMinor(1000n, 250n)).toBe(750n);
  });
});

describe('scaleMinor', () => {
  it('rounds half away from zero', () => {
    expect(scaleMinor(100n, 1.005)).toBe(101n); // 100.5 -> 101 (round half up)
    expect(scaleMinor(100n, 1.004)).toBe(100n);
    expect(scaleMinor(-100n, 1.005)).toBe(-101n);
  });

  it('rejects a non-finite factor', () => {
    expect(() => scaleMinor(100n, Number.NaN)).toThrow();
    expect(() => scaleMinor(100n, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('applyPercent', () => {
  it('computes a percentage of a minor-unit amount', () => {
    expect(applyPercent(10000n, 15)).toBe(1500n); // 15% of $100.00 = $15.00
    expect(applyPercent(999n, 0)).toBe(0n);
  });
});

describe('priceForCostPlus', () => {
  it('marks the cost up by the given percentage', () => {
    expect(priceForCostPlus(1000n, 50)).toBe(1500n); // $10 cost, 50% markup -> $15
    expect(priceForCostPlus(1000n, 0)).toBe(1000n);
  });

  it('rejects a negative markup', () => {
    expect(() => priceForCostPlus(1000n, -10)).toThrow();
  });
});

describe('priceForFixedMargin', () => {
  it('computes the price whose margin at that price equals the target', () => {
    // cost $10, 50% margin target -> price $20 (margin = (20-10)/20 = 50%)
    expect(priceForFixedMargin(1000n, 50)).toBe(2000n);
  });

  it('rejects marginPct >= 100 (would divide by zero or go negative)', () => {
    expect(() => priceForFixedMargin(1000n, 100)).toThrow();
    expect(() => priceForFixedMargin(1000n, 150)).toThrow();
  });

  it('rejects a negative marginPct', () => {
    expect(() => priceForFixedMargin(1000n, -5)).toThrow();
  });
});

describe('marginPercentOf', () => {
  it('computes margin percentage from price and cost', () => {
    expect(marginPercentOf(2000n, 1000n)).toBeCloseTo(50, 5);
    expect(marginPercentOf(10000n, 7500n)).toBeCloseTo(25, 5);
  });

  it('returns 0 for a zero or negative price rather than dividing by zero', () => {
    expect(marginPercentOf(0n, 1000n)).toBe(0);
    expect(marginPercentOf(-100n, 1000n)).toBe(0);
  });

  it('returns a negative margin when selling below cost', () => {
    expect(marginPercentOf(1000n, 1500n)).toBeLessThan(0);
  });
});

describe('roundToNearestMinor', () => {
  it('rounds to the nearest step, half rounds up', () => {
    expect(roundToNearestMinor(1223n, 5n)).toBe(1225n);
    expect(roundToNearestMinor(1222n, 5n)).toBe(1220n);
    expect(roundToNearestMinor(1222n, 1n)).toBe(1222n); // nearest-integer minor step is a no-op at minor granularity
  });

  it('is a no-op for a non-positive step', () => {
    expect(roundToNearestMinor(1234n, 0n)).toBe(1234n);
    expect(roundToNearestMinor(1234n, -5n)).toBe(1234n);
  });
});

describe('roundPsychological99', () => {
  it('rounds up to the nearest whole unit minus one minor unit', () => {
    expect(roundPsychological99(1234n)).toBe(1299n); // $12.34 -> $12.99
    expect(roundPsychological99(1200n)).toBe(1299n); // exactly $12.00 still rounds UP to $12.99
    expect(roundPsychological99(1n)).toBe(99n); // $0.01 -> $0.99
    expect(roundPsychological99(0n)).toBe(99n); // $0.00 -> $0.99 (never below the input)
  });

  it('is idempotent on an amount already ending in .99', () => {
    expect(roundPsychological99(1299n)).toBe(1299n);
  });

  it('never returns a value below the input (no accidental undercut)', () => {
    expect(roundPsychological99(1299n)).toBeGreaterThanOrEqual(1299n);
    expect(roundPsychological99(1300n)).toBeGreaterThanOrEqual(1300n);
  });

  it('is a no-op for a zero-decimal currency', () => {
    expect(roundPsychological99(1234n, 1n)).toBe(1234n);
  });
});

describe('applyCurrencyFloor', () => {
  it('raises an amount below the floor', () => {
    expect(applyCurrencyFloor(500n, 1000n)).toBe(1000n);
  });

  it('leaves an amount at or above the floor untouched', () => {
    expect(applyCurrencyFloor(1500n, 1000n)).toBe(1500n);
    expect(applyCurrencyFloor(1000n, 1000n)).toBe(1000n);
  });

  it('is a no-op when no floor is configured', () => {
    expect(applyCurrencyFloor(500n, undefined)).toBe(500n);
    expect(applyCurrencyFloor(500n, null)).toBe(500n);
  });
});

describe('convertMinor', () => {
  it('applies an FX rate and rounds to the nearest minor unit', () => {
    expect(convertMinor(1000n, 3.75)).toBe(3750n); // $10 USD -> 37.50 SAR at 3.75
  });
});

describe('clampNonNegative', () => {
  it('clamps a negative amount to zero', () => {
    expect(clampNonNegative(-500n)).toBe(0n);
    expect(clampNonNegative(500n)).toBe(500n);
    expect(clampNonNegative(0n)).toBe(0n);
  });
});
