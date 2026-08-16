import { scaleMinor } from './money-math';

/**
 * FX ingestion + gain/loss math (Phase 6, task 6.3). Pure, unit-tested,
 * network/DB-free — `apps/api/src/finance/fx/*` supplies the actual rate
 * SOURCE (a real interface + a mock/fixed-rate provider, since no live FX API
 * key exists in this sandbox, docs/DEBT.md) and calls into these functions
 * for the arithmetic.
 *
 * `rate` is always "1 base unit = `rate` quote units" (matches the existing
 * `FxRate` Prisma model's `baseCurrency`/`quoteCurrency`/`rate` columns,
 * Phase 2). Money amounts are always non-negative `bigint` minor units in the
 * QUOTE currency they are denominated in at that point in time.
 */

export interface FxQuote {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  asOf: Date;
}

/** A rate-source adapter (task 6.3's "rate-source interface"). Real
 * implementations (a live provider) and the mock/fixed-rate stand-in used in
 * this sandbox both satisfy this one contract. */
export interface FxRateSource {
  readonly name: string;
  getRate(baseCurrency: string, quoteCurrency: string, asOf?: Date): Promise<FxQuote>;
}

/** Convert a minor-unit amount from `baseCurrency` to `quoteCurrency` at the
 * given quote's rate. Thin wrapper over `scaleMinor` so callers never touch
 * a raw float themselves. */
export function convertAtRate(amountMinor: bigint, quote: FxQuote): bigint {
  return scaleMinor(amountMinor, quote.rate);
}

/**
 * Realised FX gain/loss (task 6.3): the amount actually settled, in the
 * tenant's home currency, minus what the ORIGINAL transaction would have
 * been worth at the rate booked when it was first recognised. Positive =
 * gain (the home-currency value went up between booking and settlement),
 * negative = loss. Both amounts must already be in the tenant's home
 * currency (i.e. already converted via `convertAtRate` using the respective
 * quote) — this function is intentionally just a subtraction so a caller
 * cannot accidentally mix currencies without going through a quote first.
 */
export function computeRealisedGainLoss(bookedHomeCurrencyMinor: bigint, settledHomeCurrencyMinor: bigint): bigint {
  return settledHomeCurrencyMinor - bookedHomeCurrencyMinor;
}

/**
 * Unrealised FX gain/loss (task 6.3): a still-open foreign-currency
 * receivable/payable revalued at today's rate vs. the rate it was booked at,
 * without any cash actually moving. `openForeignMinor` is the original
 * foreign-currency-denominated amount; `bookedRate`/`currentRate` are both
 * "1 foreign unit = N home-currency units".
 */
export function computeUnrealisedGainLoss(openForeignMinor: bigint, bookedRate: number, currentRate: number): bigint {
  const bookedHome = scaleMinor(openForeignMinor, bookedRate);
  const currentHome = scaleMinor(openForeignMinor, currentRate);
  return currentHome - bookedHome;
}
