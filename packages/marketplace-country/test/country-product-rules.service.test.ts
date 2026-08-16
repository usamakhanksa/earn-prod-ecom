import { describe, expect, it } from 'vitest';
import { CountryConfigService } from '../src/config/country-config.service.js';
import { MockCountryConfigRepository } from '../src/config/country-config.repository.mock.js';
import { CountryProductRulesService } from '../src/rules/country-product-rules.service.js';

function buildService() {
  const countryConfigService = new CountryConfigService(new MockCountryConfigRepository());
  return new CountryProductRulesService(countryConfigService);
}

describe('CountryProductRulesService', () => {
  it('reports a marketplace as available only for a known, active country', async () => {
    const service = buildService();
    expect(await service.isMarketplaceAvailable('US')).toBe(true);
    expect(await service.isMarketplaceAvailable('ZZ')).toBe(false);
  });

  it('restricts a category for a country flagged in CountryConfig data (not a hardcoded branch)', async () => {
    const service = buildService();
    expect(await service.isCategoryAvailable('SA', 'alcohol-spirits')).toBe(false);
    expect(await service.isCategoryAvailable('PK', 'alcohol-spirits')).toBe(false);
    expect(await service.isCategoryAvailable('US', 'alcohol-spirits')).toBe(true);
    expect(await service.isCategoryAvailable('US', 'electronics')).toBe(true);
  });

  it('treats an uncategorized product as always category-available', async () => {
    const service = buildService();
    expect(await service.isCategoryAvailable('SA', null)).toBe(true);
  });

  it('returns false for a category check against an unknown country', async () => {
    const service = buildService();
    expect(await service.isCategoryAvailable('ZZ', 'electronics')).toBe(false);
  });

  it('rejects a product whose category is restricted in the country, even if flagged available', async () => {
    const service = buildService();
    const available = await service.isProductAvailable('SA', {
      categorySlug: 'alcohol-spirits',
      countryAvailability: [{ countryCode: 'SA', isAvailable: true }],
    });
    expect(available).toBe(false);
  });

  it('rejects a product with no matching per-country availability row', async () => {
    const service = buildService();
    const available = await service.isProductAvailable('US', {
      categorySlug: 'electronics',
      countryAvailability: [{ countryCode: 'GB', isAvailable: true }],
    });
    expect(available).toBe(false);
  });

  it('rejects a product explicitly marked unavailable for that country', async () => {
    const service = buildService();
    const available = await service.isProductAvailable('US', {
      categorySlug: 'electronics',
      countryAvailability: [{ countryCode: 'US', isAvailable: false }],
    });
    expect(available).toBe(false);
  });

  it('accepts a non-restricted, explicitly-available product for that country', async () => {
    const service = buildService();
    const available = await service.isProductAvailable('US', {
      categorySlug: 'electronics',
      countryAvailability: [{ countryCode: 'US', isAvailable: true }],
    });
    expect(available).toBe(true);
  });

  it('filters a category list down to what a country actually sells', async () => {
    const service = buildService();
    const filtered = await service.filterAvailableCategorySlugs('SA', [
      'electronics',
      'alcohol-spirits',
      'fashion-apparel',
    ]);
    expect(filtered).toEqual(['electronics', 'fashion-apparel']);
  });

  it('returns an empty filtered list for an unknown country', async () => {
    const service = buildService();
    expect(await service.filterAvailableCategorySlugs('ZZ', ['electronics'])).toEqual([]);
  });
});
