import { describe, expect, it } from 'vitest';
import { CountryConfigService } from '../src/config/country-config.service.js';
import { MockCountryConfigRepository } from '../src/config/country-config.repository.mock.js';
import type { CountryConfig } from '../src/types.js';

function buildService() {
  return new CountryConfigService(new MockCountryConfigRepository());
}

describe('CountryConfigService', () => {
  it('lists all nine seeded countries as active', async () => {
    const service = buildService();
    const active = await service.listActive();
    expect(active).toHaveLength(9);
    expect(active.every((c) => c.isActive)).toBe(true);
  });

  it('looks up a known country by code, data-driven (not hardcoded per-country branches)', async () => {
    const service = buildService();
    const sa = await service.getByCode('SA');
    expect(sa).not.toBeNull();
    expect(sa?.currency).toBe('SAR');
    expect(sa?.defaultLanguage).toBe('ar');
    expect(sa?.timezone).toBe('Asia/Riyadh');
    expect(sa?.supportedPayments).toContain('mada');
  });

  it('is case-insensitive on country code lookup', async () => {
    const service = buildService();
    const lower = await service.getByCode('sa');
    const upper = await service.getByCode('SA');
    expect(lower).toEqual(upper);
  });

  it('returns null for an unknown country code', async () => {
    const service = buildService();
    expect(await service.getByCode('ZZ')).toBeNull();
    expect(await service.isSupported('ZZ')).toBe(false);
  });

  it('returns null for an inactive country even if the code exists', async () => {
    const inactiveRow: CountryConfig = {
      code: 'ZZ',
      name: 'Inactive Land',
      nativeName: null,
      currency: 'USD',
      currencySymbol: '$',
      defaultLanguage: 'en',
      timezone: 'UTC',
      isActive: false,
      supportedPayments: [],
      supportedMarketplaces: [],
      shippingProviders: [],
      restrictedCategorySlugs: [],
    };
    const service = new CountryConfigService(
      new MockCountryConfigRepository([inactiveRow]),
      'ZZ',
    );
    expect(await service.getByCode('ZZ')).toBeNull();
  });

  it('exposes per-country supported payments/marketplaces/shipping without branching in callers', async () => {
    const service = buildService();
    expect(await service.supportedPayments('PK')).toEqual(
      expect.arrayContaining(['easypaisa', 'jazzcash']),
    );
    expect(await service.supportedMarketplaces('IN')).toEqual(
      expect.arrayContaining(['amazon_in', 'flipkart']),
    );
    expect(await service.shippingProviders('DE')).toEqual(
      expect.arrayContaining(['dhl', 'hermes']),
    );
  });

  it('exposes per-country restricted category slugs, data-driven only', async () => {
    const service = buildService();
    expect(await service.restrictedCategorySlugs('SA')).toEqual(['alcohol-spirits']);
    expect(await service.restrictedCategorySlugs('PK')).toEqual(['alcohol-spirits']);
    expect(await service.restrictedCategorySlugs('US')).toEqual([]);
  });

  it('resolves the configured fallback country', async () => {
    const service = buildService();
    const fallback = await service.getFallback();
    expect(fallback.code).toBe('US');
  });

  it('throws a clear error if the fallback country code is missing from seed data', async () => {
    const service = new CountryConfigService(new MockCountryConfigRepository([]), 'US');
    await expect(service.getFallback()).rejects.toThrow(/Fallback country/);
  });
});
