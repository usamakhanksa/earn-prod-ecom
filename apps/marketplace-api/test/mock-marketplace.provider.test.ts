import { describe, expect, it, beforeEach } from 'vitest';
import { CountryConfigService, MockCountryConfigRepository } from '@marketplace/country';
import { MockProductRepository } from '../src/repositories/product.repository.mock.js';
import { MockMarketplaceProvider } from '../src/providers/mock-marketplace.provider.js';

function buildProvider() {
  const countryConfigService = new CountryConfigService(new MockCountryConfigRepository());
  return new MockMarketplaceProvider(new MockProductRepository(), countryConfigService);
}

describe('MockMarketplaceProvider (against the in-memory seeded catalog — MOCK_MODE path)', () => {
  let provider: ReturnType<typeof buildProvider>;

  beforeEach(() => {
    provider = buildProvider();
  });

  it('searches the seeded catalog with pagination', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 5 });
    expect(result.items).toHaveLength(5);
    expect(result.total).toBeGreaterThan(30);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(5);
  });

  it('normalizes every result into the exact UnifiedProduct shape', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 1 });
    const [product] = result.items;
    expect(product).toMatchObject({
      source: 'internal',
      supplier: null,
      affiliateCommission: null,
    });
    expect(typeof product!.price).toBe('number');
    expect(Array.isArray(product!.images)).toBe(true);
    expect(Array.isArray(product!.countryAvailability)).toBe(true);
  });

  it('filters by category slug', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 100, categorySlug: 'electronics' });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((p) => p.category?.slug === 'electronics')).toBe(true);
  });

  it('filters by search text across title/description', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 100, query: 'earbuds' });
    expect(result.items.some((p) => p.name.toLowerCase().includes('earbuds'))).toBe(true);
  });

  it('filters by min/max price', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 100, minPrice: 10, maxPrice: 20 });
    expect(result.items.every((p) => p.price >= 10 && p.price <= 20)).toBe(true);
  });

  it('sorts by price ascending', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 100, sort: 'price_asc' });
    const prices = result.items.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("excludes a country's restricted category (alcohol in Saudi Arabia) without any hardcoded branch", async () => {
    const result = await provider.searchProducts({
      page: 1,
      limit: 100,
      countryCode: 'SA',
      categorySlug: 'alcohol-spirits',
    });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns products available in a country, excluding ones only sold elsewhere', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 100, countryCode: 'PK' });
    expect(result.items.some((p) => p.countryAvailability.includes('PK'))).toBe(true);
    // Camping tents in this catalog are only seeded for Western markets.
    expect(result.items.some((p) => p.name.includes('Camping Tent'))).toBe(false);
  });

  it('returns an empty result for an unsupported country code', async () => {
    const result = await provider.searchProducts({ page: 1, limit: 100, countryCode: 'ZZ' });
    expect(result.items).toHaveLength(0);
  });

  it('applies a country-specific price override when one exists', async () => {
    const withoutCountry = await provider.getProduct('wireless-earbuds-pro');
    const withSaudiCountry = await provider.getProduct('wireless-earbuds-pro', 'SA');
    expect(withoutCountry?.currency).toBe('USD');
    expect(withSaudiCountry?.currency).toBe('SAR');
    expect(withSaudiCountry?.price).not.toBe(withoutCountry?.price);
  });

  it('attaches a shipping estimate only when a country was supplied', async () => {
    const withoutCountry = await provider.getProduct('wireless-earbuds-pro');
    const withCountry = await provider.getProduct('wireless-earbuds-pro', 'US');
    expect(withoutCountry?.shipping).toBeNull();
    expect(withCountry?.shipping).not.toBeNull();
    expect(withCountry?.shipping?.countryCode).toBe('US');
  });

  it('returns null for an unknown product', async () => {
    expect(await provider.getProduct('does-not-exist')).toBeNull();
  });

  it('lists all seeded categories when no country is given', async () => {
    const categories = await provider.getCategories();
    expect(categories.length).toBe(8);
    expect(categories.every((c) => c.isAvailable)).toBe(true);
  });

  it('filters out a restricted category for a given country (real GET /categories?country=SA behavior)', async () => {
    const categories = await provider.getCategories('SA');
    expect(categories.some((c) => c.slug === 'alcohol-spirits')).toBe(false);
    expect(categories.some((c) => c.slug === 'electronics')).toBe(true);
  });

  it('reports availability true/false correctly via getAvailability', async () => {
    const product = await provider.getProduct('wireless-earbuds-pro');
    const availableInUS = await provider.getAvailability(product!.id, 'US');
    expect(availableInUS.available).toBe(true);
    expect(availableInUS.stock).not.toBeNull();

    const alcohol = await provider.getProduct('craft-whisky-750ml');
    const unavailableInSA = await provider.getAvailability(alcohol!.id, 'SA');
    expect(unavailableInSA.available).toBe(false);
    expect(unavailableInSA.stock).toBeNull();
  });

  it('returns pricing with the country override applied via getPricing', async () => {
    const product = await provider.getProduct('wireless-earbuds-pro');
    const pricing = await provider.getPricing(product!.id, 'SA');
    expect(pricing.currency).toBe('SAR');
  });

  it('returns a shipping estimate via getShipping', async () => {
    const product = await provider.getProduct('wireless-earbuds-pro');
    const shipping = await provider.getShipping(product!.id, 'US');
    expect(shipping.countryCode).toBe('US');
    expect(shipping.estimatedDaysMin).toBeGreaterThan(0);
  });
});
