/**
 * Pure integer-minor-units money math for the pricing/margin engines
 * (implentationplanphase.md Phase 2 tasks 2.9-2.11, prompt.md constraint #6).
 *
 * Every function here consumes and returns `bigint` minor units — a money
 * amount is never represented as `number`/float in this module. `pct`/`rate`
 * parameters are plain numbers because they ARE ratios, not money (e.g. "12.5%
 * margin", "1.37 SAR per USD") — the one place floating point legitimately
 * touches a money computation is the multiply step, which rounds back to an
 * integer minor unit immediately (`scaleMinor`) rather than letting float
 * drift accumulate across a chain of operations.
 */

export function addMinor(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subtractMinor(a: bigint, b: bigint): bigint {
  return a - b;
}

/**
 * Round-half-away-from-zero to the nearest minor unit after a float multiply.
 *
 * A plain `Math.round` is not enough here: `100 * 1.005 === 100.49999999999999`
 * in IEEE-754 double precision, which would silently round a "nice" decimal
 * factor the wrong way. A relative epsilon nudges the product back onto the
 * intended value before rounding — standard practice for decimal-looking
 * float factors, and safe at any money magnitude this product deals in (well
 * under the 2^53 safe-integer range where the correction itself could flip a
 * genuinely-close-but-different value).
 */
export function scaleMinor(amountMinor: bigint, factor: number): bigint {
  if (!Number.isFinite(factor)) {
    throw new Error(`Invalid scale factor: ${factor}`);
  }
  const scaled = Number(amountMinor) * factor;
  const epsilon = Math.max(1, Math.abs(scaled)) * 1e-9;
  const adjusted = scaled + Math.sign(scaled) * epsilon;
  const rounded = adjusted >= 0 ? Math.floor(adjusted + 0.5) : Math.ceil(adjusted - 0.5);
  return BigInt(rounded);
}

export function applyPercent(amountMinor: bigint, pct: number): bigint {
  return scaleMinor(amountMinor, pct / 100);
}

/**
 * The price P such that margin = (P - cost) / P == marginPct/100, i.e.
 * P = cost / (1 - marginPct/100). This is "fixed margin" pricing (3.6),
 * distinct from cost-plus (which marks up the COST, not the resulting price).
 */
export function priceForFixedMargin(costMinor: bigint, marginPct: number): bigint {
  if (marginPct >= 100 || marginPct < 0) {
    throw new Error(`marginPct must be in [0, 100): received ${marginPct}`);
  }
  return scaleMinor(costMinor, 1 / (1 - marginPct / 100));
}

/** Cost-plus: price = cost * (1 + pct/100). */
export function priceForCostPlus(costMinor: bigint, pct: number): bigint {
  if (pct < 0) {
    throw new Error(`costPlusPct must be >= 0: received ${pct}`);
  }
  return scaleMinor(costMinor, 1 + pct / 100);
}

/** Margin % realised by selling at `priceMinor` against `costMinor`. Returns 0
 * for a zero/negative price rather than dividing by zero or NaN-ing the UI. */
export function marginPercentOf(priceMinor: bigint, costMinor: bigint): number {
  if (priceMinor <= 0n) {
    return 0;
  }
  return (Number(priceMinor - costMinor) / Number(priceMinor)) * 100;
}

/** Round to the nearest multiple of `stepMinor` (half rounds up). `stepMinor
 * <= 0` is a no-op — NEAREST_5/NEAREST_INTEGER pass an explicit step; NONE
 * never calls this at all. */
export function roundToNearestMinor(amountMinor: bigint, stepMinor: bigint): bigint {
  if (stepMinor <= 0n) {
    return amountMinor;
  }
  const remainder = ((amountMinor % stepMinor) + stepMinor) % stepMinor;
  const down = amountMinor - remainder;
  return remainder * 2n >= stepMinor ? down + stepMinor : down;
}

/**
 * Psychological ".99" rounding (3.6): finds the SMALLEST "whole-unit-minus-one-
 * minor-unit" price that is still >= the input, so the tenant never
 * accidentally undercuts a computed price to look pretty. 1234 minor (12.34,
 * USD) -> 1299 (12.99). An exact whole unit also rounds UP to the next .99
 * (1200 -> 1299, i.e. $12.00 -> $12.99) rather than down to $11.99 — matching
 * how psychological pricing is applied in practice (a floor here would give
 * the customer a price the tenant never configured). `minorUnitsPerMajor`
 * defaults to 100 (two-decimal currencies); pass 1 for a zero-decimal
 * currency, where this rule is a documented no-op.
 */
export function roundPsychological99(amountMinor: bigint, minorUnitsPerMajor = 100n): bigint {
  if (minorUnitsPerMajor <= 1n) {
    return amountMinor;
  }
  // Smallest k with k*minorUnitsPerMajor - 1 >= amountMinor
  //   <=> k >= (amountMinor + 1) / minorUnitsPerMajor
  //   <=> k = floor((amountMinor + minorUnitsPerMajor) / minorUnitsPerMajor)
  const wholeUnits = (amountMinor + minorUnitsPerMajor) / minorUnitsPerMajor;
  return wholeUnits * minorUnitsPerMajor - 1n;
}

/** Per-currency floor (3.6) — never let a computed price fall below the
 * tenant's configured minimum for that currency. */
export function applyCurrencyFloor(amountMinor: bigint, floorMinor: bigint | undefined | null): bigint {
  if (floorMinor === undefined || floorMinor === null) {
    return amountMinor;
  }
  return amountMinor < floorMinor ? floorMinor : amountMinor;
}

/** Convert a minor-unit amount from one currency to another using a plain
 * rate ratio (Phase 2 scope: a lookup value, not live ingestion — see
 * docs/DEBT.md for the Phase 6 FX ingestion seam). */
export function convertMinor(amountMinor: bigint, rate: number): bigint {
  return scaleMinor(amountMinor, rate);
}

/** Never let a money value go negative from a chain of subtractions (fees +
 * shipping + tax exceeding gross price on a badly-configured SKU should show
 * as a big fat zero/negative-margin warning, not an underflowed negative
 * "cost" that would misrender in a waterfall bar). */
export function clampNonNegative(amountMinor: bigint): bigint {
  return amountMinor < 0n ? 0n : amountMinor;
}
