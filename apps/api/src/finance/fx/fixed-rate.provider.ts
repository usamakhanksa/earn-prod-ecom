import { Injectable, NotFoundException } from '@nestjs/common';
import type { FxQuote, FxRateSource } from '@omnisell/shared';

/**
 * Mock/fixed-rate FX provider (Phase 6, task 6.3 — "a rate-source interface
 * with a mock/fixed-rate provider since no live FX API key exists here").
 *
 * These rates are ILLUSTRATIVE, roughly-current-at-time-of-writing point
 * estimates for the currency pairs this product's KSA/GCC and US/EU scope
 * actually needs — NOT live market data, and NOT independently re-verified
 * against a real FX data provider (no `FX_API_KEY`/similar exists in this
 * sandbox, docs/DEBT.md). Every rate here is honestly attributed to
 * `source: 'fixed-rate-fallback'` when ingested, never presented as a live
 * quote. A real provider (e.g. exchangerate.host, Open Exchange Rates, or
 * a bank's own rate feed) implements the exact same `FxRateSource` interface
 * — swapping this class out is a zero-call-site-change operation the moment
 * a real API key exists.
 */
@Injectable()
export class FixedRateFxProvider implements FxRateSource {
  readonly name = 'fixed-rate-fallback';

  // "1 base unit = N quote units". GCC pegs (SAR/AED to USD) are genuinely
  // fixed by policy, not estimates; the rest are illustrative snapshots.
  private static readonly RATES: Record<string, number> = {
    'USD:SAR': 3.75, // Saudi Riyal — pegged
    'USD:AED': 3.6725, // UAE Dirham — pegged
    'USD:KWD': 0.307, // Kuwaiti Dinar — illustrative
    'USD:BHD': 0.376, // Bahraini Dinar — pegged
    'USD:QAR': 3.64, // Qatari Riyal — pegged
    'USD:OMR': 0.3845, // Omani Rial — pegged
    'USD:EUR': 0.92,
    'USD:GBP': 0.79,
    'USD:EGP': 49.0,
  };

  async getRate(baseCurrency: string, quoteCurrency: string, asOf: Date = new Date()): Promise<FxQuote> {
    if (baseCurrency === quoteCurrency) {
      return { baseCurrency, quoteCurrency, rate: 1, asOf };
    }
    const direct = FixedRateFxProvider.RATES[`${baseCurrency}:${quoteCurrency}`];
    if (direct !== undefined) {
      return { baseCurrency, quoteCurrency, rate: direct, asOf };
    }
    const inverse = FixedRateFxProvider.RATES[`${quoteCurrency}:${baseCurrency}`];
    if (inverse !== undefined) {
      return { baseCurrency, quoteCurrency, rate: 1 / inverse, asOf };
    }
    throw new NotFoundException({
      message: `No fixed FX rate configured for ${baseCurrency}->${quoteCurrency}. This sandbox has no live FX provider key; add the pair to FixedRateFxProvider.RATES or supply a real FxRateSource implementation.`,
      code: 'fx_rate_unavailable',
    });
  }
}
