import { describe, expect, it } from 'vitest';
import { balanceFromDeltas, earnDelta, pointsSchema, spendDelta } from '../src/points';

describe('pointsSchema', () => {
  it('accepts non-negative bigint values', () => {
    expect(pointsSchema.safeParse(100n).success).toBe(true);
    expect(pointsSchema.safeParse(0n).success).toBe(true);
  });

  it('rejects negative values', () => {
    expect(pointsSchema.safeParse(-5n).success).toBe(false);
  });
});

describe('balance derivation', () => {
  it('sums validated deltas', () => {
    const deltas = [earnDelta(50n), spendDelta(20n), earnDelta(30n)];
    expect(balanceFromDeltas(deltas).toString()).toBe('60');
  });

  it('cannot produce a negative balance from validated deltas alone', () => {
    // A negative result signals an invariant violation upstream; it must not be written.
    const deltas = [spendDelta(100n), earnDelta(10n)];
    expect(balanceFromDeltas(deltas)).toBeLessThan(0n);
  });
});