import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/products (against MockMarketplaceProvider / the seeded catalog — MOCK_MODE path)', () => {
  it('returns a paginated response with real seeded data', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(30);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('validates query params with Zod and returns 400 for a bad country code', async () => {
    const res = await request(app).get('/api/products?country=SAU');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('validates page/limit as coerced integers', async () => {
    const res = await request(app).get('/api/products?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
    expect(res.body.items).toHaveLength(5);
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/products?category=electronics&limit=100');
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { category: { slug: string } | null }) => p.category?.slug === 'electronics')).toBe(true);
  });

  it("returns an empty list for a country's restricted category (Saudi Arabia + alcohol)", async () => {
    const res = await request(app).get('/api/products?country=SA&category=alcohol-spirits');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('searches by free text', async () => {
    const res = await request(app).get('/api/products?search=earbuds');
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: { name: string }) => p.name.toLowerCase().includes('earbuds'))).toBe(
      true,
    );
  });
});

describe('GET /api/products/:slug', () => {
  it('returns a single normalized product', async () => {
    const res = await request(app).get('/api/products/wireless-earbuds-pro');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Wireless Earbuds Pro');
    expect(res.body.supplier).toBeNull();
    expect(res.body.affiliateCommission).toBeNull();
  });

  it('applies a country-specific price/shipping context via ?country=', async () => {
    const res = await request(app).get('/api/products/wireless-earbuds-pro?country=SA');
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('SAR');
    expect(res.body.shipping).not.toBeNull();
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await request(app).get('/api/products/does-not-exist-at-all');
    expect(res.status).toBe(404);
  });
});
