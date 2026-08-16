import { z } from 'zod';

/**
 * Loyalty points — integer BIGINT units (docs/points-extension.md §3.1).
 * Never float math, never a `number`.
 */
export const pointsSchema = z
  .bigint()
  .refine((value) => value >= 0n, { message: 'Points must be non-negative' })
  .brand<'Points'>('Points');
export type Points = z.infer<typeof pointsSchema>;

/** Signed delta used by PointTransaction rows (positive earn / negative spend). */
export const pointsDeltaSchema = z.bigint().brand<'PointsDelta'>('PointsDelta');
export type PointsDelta = z.infer<typeof pointsDeltaSchema>;

export function addPoints(a: Points, b: Points): Points {
  return (a as unknown as bigint) + (b as unknown as bigint) as Points;
}

export function pointsToBigInt(points: Points): bigint {
  return points as unknown as bigint;
}

/**
 * Derive the available balance from VALIDATED transacted deltas — the authoritative source.
 * PENDING/REVERSED rows must never be passed here (enforced at the repository layer).
 */
export function balanceFromDeltas(deltas: readonly bigint[]): bigint {
  return deltas.reduce((acc, delta) => acc + delta, 0n);
}

export function earnDelta(amount: bigint): bigint {
  return amount;
}

export function spendDelta(amount: bigint): bigint {
  return -amount;
}