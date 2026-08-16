import { describe, expect, it, vi } from 'vitest';
import { FxService } from '../src/finance/fx/fx.service';
import { FixedRateFxProvider } from '../src/finance/fx/fixed-rate.provider';
import type { FxRateRepository } from '../src/repositories/fx-rate.repository';

function makeService() {
  const rates = {
    upsert: vi.fn().mockImplementation((base, quote, rate, asOf, source) => Promise.resolve({ id: 'r1', baseCurrency: base, quoteCurrency: quote, rate, asOf, source })),
    findLatest: vi.fn(),
  };
  const provider = new FixedRateFxProvider();
  return { service: new FxService(rates as unknown as FxRateRepository, provider), rates, provider };
}

describe('FixedRateFxProvider', () => {
  it('returns the direct pegged rate for USD->SAR', async () => {
    const provider = new FixedRateFxProvider();
    const quote = await provider.getRate('USD', 'SAR');
    expect(quote.rate).toBe(3.75);
  });

  it('derives the inverse rate when only the reverse pair is configured', async () => {
    const provider = new FixedRateFxProvider();
    const quote = await provider.getRate('SAR', 'USD');
    expect(quote.rate).toBeCloseTo(1 / 3.75, 6);
  });

  it('returns rate 1 for the same currency on both sides', async () => {
    const provider = new FixedRateFxProvider();
    const quote = await provider.getRate('USD', 'USD');
    expect(quote.rate).toBe(1);
  });

  it('throws an honest error for an unconfigured pair rather than guessing', async () => {
    const provider = new FixedRateFxProvider();
    await expect(provider.getRate('USD', 'XYZ')).rejects.toThrow(/No fixed FX rate configured/);
  });
});

describe('FxService.ingest / convert', () => {
  it('ingests a rate from the configured source into the FxRate cache', async () => {
    const { service, rates } = makeService();
    await service.ingest([{ base: 'USD', quote: 'SAR' }], new Date('2026-08-16'));
    expect(rates.upsert).toHaveBeenCalledWith('USD', 'SAR', 3.75, new Date('2026-08-16'), 'fixed-rate-fallback');
  });

  it('convert() uses the latest cached rate', async () => {
    const { service, rates } = makeService();
    rates.findLatest.mockResolvedValue({ baseCurrency: 'USD', quoteCurrency: 'SAR', rate: 3.75, asOf: new Date() });
    const result = await service.convert('USD', 'SAR', 1000n);
    expect(result.amountMinor).toBe(3750n);
  });

  it('convert() throws honestly when no rate has ever been ingested for the pair', async () => {
    const { service, rates } = makeService();
    rates.findLatest.mockResolvedValue(null);
    await expect(service.convert('USD', 'JPY', 1000n)).rejects.toThrow(/No FX rate available/);
  });
});

describe('FxService gain/loss orchestration', () => {
  it('computeRealisedGainLoss compares the booked-rate vs settled-rate home-currency value', async () => {
    const { service, rates } = makeService();
    rates.findLatest
      .mockResolvedValueOnce({ rate: 3.75, asOf: new Date('2026-08-01') }) // booked
      .mockResolvedValueOnce({ rate: 3.8, asOf: new Date('2026-08-15') }); // settled
    const result = await service.computeRealisedGainLoss({ foreignCurrency: 'USD', homeCurrency: 'SAR', foreignAmountMinor: 1000n, bookedAt: new Date('2026-08-01'), settledAt: new Date('2026-08-15') });
    expect(result.gainOrLossMinor).toBe(50n); // 3800 - 3750
  });

  it('computeUnrealisedGainLoss revalues an open position at the current rate', async () => {
    const { service, rates } = makeService();
    rates.findLatest
      .mockResolvedValueOnce({ rate: 3.75, asOf: new Date('2026-08-01') })
      .mockResolvedValueOnce({ rate: 3.7, asOf: new Date() });
    const result = await service.computeUnrealisedGainLoss({ foreignCurrency: 'USD', homeCurrency: 'SAR', openForeignAmountMinor: 1000n, bookedAt: new Date('2026-08-01') });
    expect(result.gainOrLossMinor).toBe(-50n);
  });
});
