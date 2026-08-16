import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/categories', () => {
  it('lists all 8 seeded categories with no country filter', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.every((c: { isAvailable: boolean }) => c.isAvailable)).toBe(true);
  });

  it('excludes a restricted category for a given country — real filtering, not a flag', async () => {
    const res = await request(app).get('/api/categories?country=SA');
    expect(res.status).toBe(200);
    expect(res.body.some((c: { slug: string }) => c.slug === 'alcohol-spirits')).toBe(false);
  });

  it('validates the country query param', async () => {
    const res = await request(app).get('/api/categories?country=zzz');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/categories/:slug', () => {
  it('returns a single category by slug', async () => {
    const res = await request(app).get('/api/categories/electronics');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Electronics');
    expect(res.body.productCount).toBeGreaterThan(0);
  });

  it('returns 404 for a slug that truly does not exist', async () => {
    const res = await request(app).get('/api/categories/not-a-real-category');
    expect(res.status).toBe(404);
  });

  it('returns 200 with isAvailable:false for a category restricted in that country (not a 404)', async () => {
    const res = await request(app).get('/api/categories/alcohol-spirits?country=SA');
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(false);
  });
});
