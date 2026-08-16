/**
 * Pure formatting helpers shared by the product card/detail/list UI. Kept
 * dependency-free and unit-tested (test/format.test.ts) rather than
 * inlined per-component, since price/discount formatting is used in at
 * least three places (grid card, detail page, category page).
 */

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    // Intl throws for a currency code it doesn't recognize (e.g. a
    // marketplace-specific placeholder) — fall back to a plain number
    // rather than crashing the product card.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Whole-number percent off, or null when there's no discount to show. */
export function computeDiscountPercent(price: number, originalPrice: number | null): number | null {
  if (originalPrice === null || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function formatShippingEstimate(
  shipping: { estimatedDaysMin: number; estimatedDaysMax: number } | null,
): string | null {
  if (!shipping) return null;
  if (shipping.estimatedDaysMin === shipping.estimatedDaysMax) {
    return `${shipping.estimatedDaysMin} day${shipping.estimatedDaysMin === 1 ? '' : 's'}`;
  }
  return `${shipping.estimatedDaysMin}-${shipping.estimatedDaysMax} days`;
}

export function formatRating(rating: number | null, count: number): string | null {
  if (rating === null) return null;
  return `${rating.toFixed(1)} (${count.toLocaleString()})`;
}
