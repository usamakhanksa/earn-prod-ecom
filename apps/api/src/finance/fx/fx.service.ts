import { Injectable, NotFoundException } from '@nestjs/common';
import type { FxRate } from '@prisma/client';
import { computeRealisedGainLoss, computeUnrealisedGainLoss, convertAtRate } from '@omnisell/shared';
import { FxRateRepository } from '../../repositories/fx-rate.repository';
import { FixedRateFxProvider } from './fixed-rate.provider';

/**
 * FX rate ingestion + gain/loss orchestration (Phase 6, task 6.3). The
 * arithmetic itself lives in `@omnisell/shared/fx-math` (pure, unit-tested
 * with zero DB/network involvement); this service is the thin DB-aware layer
 * that reads/writes `FxRate` (the Phase 2 bare cache table this phase is the
 * first real writer for, docs/DEBT.md 2-D9) and calls the configured
 * `FxRateSource` (today: `FixedRateFxProvider`, since no live FX API key
 * exists in this sandbox).
 */
@Injectable()
export class FxService {
  constructor(
    private readonly rates: FxRateRepository,
    private readonly source: FixedRateFxProvider,
  ) {}

  /** Ingests (or re-ingests) today's rate for each requested pair from the
   * configured source into the `FxRate` cache. */
  async ingest(pairs: Array<{ base: string; quote: string }>, asOf: Date = new Date()): Promise<FxRate[]> {
    const results: FxRate[] = [];
    for (const { base, quote } of pairs) {
      const quoteResult = await this.source.getRate(base, quote, asOf);
      results.push(await this.rates.upsert(base, quote, quoteResult.rate, asOf, this.source.name));
    }
    return results;
  }

  async convert(base: string, quote: string, amountMinor: bigint, asOf: Date = new Date()): Promise<{ amountMinor: bigint; rate: number; asOf: Date }> {
    const rate = await this.rates.findLatest(base, quote, asOf);
    if (rate === null) {
      throw new NotFoundException({ message: `No FX rate available for ${base}->${quote} as of ${asOf.toISOString()}. Ingest one first.`, code: 'fx_rate_unavailable' });
    }
    return { amountMinor: convertAtRate(amountMinor, { baseCurrency: base, quoteCurrency: quote, rate: rate.rate, asOf: rate.asOf }), rate: rate.rate, asOf: rate.asOf };
  }

  /** Realised gain/loss (task 6.3) between when a foreign-currency amount was
   * originally booked and when it actually settled, both converted to the
   * tenant's home currency at the rate in force at each moment. */
  async computeRealisedGainLoss(params: { foreignCurrency: string; homeCurrency: string; foreignAmountMinor: bigint; bookedAt: Date; settledAt: Date }): Promise<{ gainOrLossMinor: bigint; bookedRate: number; settledRate: number }> {
    const bookedQuote = await this.rates.findLatest(params.foreignCurrency, params.homeCurrency, params.bookedAt);
    const settledQuote = await this.rates.findLatest(params.foreignCurrency, params.homeCurrency, params.settledAt);
    if (bookedQuote === null || settledQuote === null) {
      throw new NotFoundException({ message: `Missing FX rate history for ${params.foreignCurrency}->${params.homeCurrency}`, code: 'fx_rate_unavailable' });
    }
    const bookedHome = convertAtRate(params.foreignAmountMinor, { baseCurrency: params.foreignCurrency, quoteCurrency: params.homeCurrency, rate: bookedQuote.rate, asOf: bookedQuote.asOf });
    const settledHome = convertAtRate(params.foreignAmountMinor, { baseCurrency: params.foreignCurrency, quoteCurrency: params.homeCurrency, rate: settledQuote.rate, asOf: settledQuote.asOf });
    return { gainOrLossMinor: computeRealisedGainLoss(bookedHome, settledHome), bookedRate: bookedQuote.rate, settledRate: settledQuote.rate };
  }

  /** Unrealised gain/loss (task 6.3) for a still-open foreign-currency
   * position, revalued at today's rate. */
  async computeUnrealisedGainLoss(params: { foreignCurrency: string; homeCurrency: string; openForeignAmountMinor: bigint; bookedAt: Date; asOf?: Date }): Promise<{ gainOrLossMinor: bigint; bookedRate: number; currentRate: number }> {
    const bookedQuote = await this.rates.findLatest(params.foreignCurrency, params.homeCurrency, params.bookedAt);
    const currentQuote = await this.rates.findLatest(params.foreignCurrency, params.homeCurrency, params.asOf ?? new Date());
    if (bookedQuote === null || currentQuote === null) {
      throw new NotFoundException({ message: `Missing FX rate history for ${params.foreignCurrency}->${params.homeCurrency}`, code: 'fx_rate_unavailable' });
    }
    const gainOrLossMinor = computeUnrealisedGainLoss(params.openForeignAmountMinor, bookedQuote.rate, currentQuote.rate);
    return { gainOrLossMinor, bookedRate: bookedQuote.rate, currentRate: currentQuote.rate };
  }
}
