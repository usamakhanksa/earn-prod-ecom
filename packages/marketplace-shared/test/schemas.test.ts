import { describe, expect, it } from 'vitest';
import {
  registerSchema,
  loginSchema,
  countryOverrideInputSchema,
  isRole,
  productListQuerySchema,
  unifiedProductSchema,
  categorySummarySchema,
} from '../src/index.js';

describe('registerSchema', () => {
  it('accepts a valid registration payload', () => {
    const result = registerSchema.safeParse({
      name: 'Ada Lovelace',
      email: 'ADA@Example.com',
      password: 'super-secret-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // email is normalized to lowercase by the schema
      expect(result.data.email).toBe('ada@example.com');
    }
  });

  it('rejects a short password', () => {
    const result = registerSchema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      name: 'Ada',
      email: 'not-an-email',
      password: 'super-secret-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('countryOverrideInputSchema', () => {
  it('normalizes country codes to uppercase', () => {
    const result = countryOverrideInputSchema.parse({ countryCode: 'sa' });
    expect(result.countryCode).toBe('SA');
  });

  it('rejects a code that is not exactly 2 letters', () => {
    expect(countryOverrideInputSchema.safeParse({ countryCode: 'SAU' }).success).toBe(false);
  });
});

describe('isRole', () => {
  it('recognizes valid roles and rejects unknown strings', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('NOT_A_ROLE')).toBe(false);
  });
});

describe('productListQuerySchema', () => {
  it('defaults page/limit and coerces string query values to numbers', () => {
    const result = productListQuerySchema.parse({ minPrice: '10', maxPrice: '100' });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.minPrice).toBe(10);
    expect(result.maxPrice).toBe(100);
  });

  it('normalizes the country code to uppercase and rejects a bad length', () => {
    expect(productListQuerySchema.parse({ country: 'sa' }).country).toBe('SA');
    expect(productListQuerySchema.safeParse({ country: 'SAU' }).success).toBe(false);
  });

  it('rejects an out-of-range rating or an unknown sort value', () => {
    expect(productListQuerySchema.safeParse({ minRating: 6 }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ sort: 'not-a-sort' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ sort: 'price_asc' }).success).toBe(true);
  });
});

describe('unifiedProductSchema', () => {
  it('accepts the exact UnifiedProduct shape with placeholder supplier/affiliateCommission', () => {
    const result = unifiedProductSchema.safeParse({
      id: 'p1',
      source: 'internal',
      sourceProductId: null,
      name: 'Wireless Earbuds',
      description: 'Noise-cancelling earbuds.',
      images: ['https://example.com/a.jpg'],
      price: 49.99,
      currency: 'USD',
      originalPrice: 69.99,
      category: { slug: 'electronics', name: 'Electronics' },
      countryAvailability: ['US', 'GB'],
      shipping: {
        countryCode: 'US',
        provider: 'ups',
        estimatedDaysMin: 3,
        estimatedDaysMax: 7,
        cost: null,
        currency: null,
      },
      rating: 4.5,
      ratingCount: 120,
      supplier: null,
      affiliateCommission: null,
      url: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('categorySummarySchema', () => {
  it('accepts a category with isAvailable computed by the country rule engine', () => {
    const result = categorySummarySchema.safeParse({
      slug: 'alcohol-spirits',
      name: 'Alcohol & Spirits',
      description: null,
      imageUrl: null,
      parentSlug: null,
      productCount: 4,
      isAvailable: false,
    });
    expect(result.success).toBe(true);
  });
});
