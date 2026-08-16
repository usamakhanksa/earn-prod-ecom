import { describe, expect, it } from 'vitest';
import { emptyPage, paginationQuerySchema } from '../src/schemas/pagination';

describe('paginationQuerySchema', () => {
  it('defaults limit to 20', () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(20);
  });

  it('coerces stringified numbers', () => {
    expect(paginationQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('clamps limits to 100', () => {
    expect(paginationQuerySchema.parse({ limit: 500 }).limit).toBe(100);
  });

  it('accepts a cursor and rejects invalid ones', () => {
    expect(paginationQuerySchema.parse({ cursor: 'abc123' }).cursor).toBe('abc123');
    expect(paginationQuerySchema.parse({})).toMatchObject({});
  });
});

describe('emptyPage', () => {
  it('returns a stable empty page', () => {
    expect(emptyPage<number>()).toEqual({ items: [], nextCursor: null });
  });
});