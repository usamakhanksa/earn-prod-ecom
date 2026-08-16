import { describe, expect, it } from 'vitest';
import {
  computeDiscountPercent,
  formatPrice,
  formatRating,
  formatShippingEstimate,
} from '../lib/format';

describe('formatPrice', () => {
  it('formats a USD amount with a currency symbol', () => {
    expect(formatPrice(59.99, 'USD')).toBe('$59.99');
  });

  it('falls back to a plain number for an unrecognized currency code', () => {
    expect(formatPrice(10, 'NOTAREALCODE')).toBe('10.00 NOTAREALCODE');
  });
});

describe('computeDiscountPercent', () => {
  it('computes a whole-number percent off', () => {
    expect(computeDiscountPercent(59.99, 89.99)).toBe(33);
  });

  it('returns null when there is no original price', () => {
    expect(computeDiscountPercent(59.99, null)).toBeNull();
  });

  it('returns null when the "original" price is not actually higher', () => {
    expect(computeDiscountPercent(59.99, 40)).toBeNull();
  });
});

describe('formatShippingEstimate', () => {
  it('formats a day range', () => {
    expect(formatShippingEstimate({ estimatedDaysMin: 3, estimatedDaysMax: 7 })).toBe('3-7 days');
  });

  it('formats a single-day estimate without a range', () => {
    expect(formatShippingEstimate({ estimatedDaysMin: 1, estimatedDaysMax: 1 })).toBe('1 day');
  });

  it('returns null when there is no shipping estimate', () => {
    expect(formatShippingEstimate(null)).toBeNull();
  });
});

describe('formatRating', () => {
  it('formats a rating with its review count', () => {
    expect(formatRating(4.5, 2143)).toBe('4.5 (2,143)');
  });

  it('returns null when there is no rating yet', () => {
    expect(formatRating(null, 0)).toBeNull();
  });
});
