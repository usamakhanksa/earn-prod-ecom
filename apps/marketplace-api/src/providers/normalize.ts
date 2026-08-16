import type { CategorySummary, UnifiedProduct, UnifiedProductShipping } from '@marketplace/shared';
import type { CategoryRecord, ProductRecord } from '../repositories/product.repository.js';

export interface NormalizeContext {
  /** Destination country, if the caller supplied one. Undefined = no country context. */
  countryCode?: string | undefined;
  /** That country's CountryConfig.shippingProviders (packages/marketplace-country data), for the shipping estimate. */
  shippingProviders?: string[] | undefined;
}

const FALLBACK_SHIPPING_DAYS_MIN = 5;
const FALLBACK_SHIPPING_DAYS_MAX = 10;
/** Heuristic spread added to a known baseline "days from origin" estimate — not a real carrier SLA. */
const SHIPPING_DAYS_SPREAD = 4;

/**
 * Normalizes this marketplace's own internal `ProductRecord` (Prisma/mock
 * repository shape) into the spec's exact `UnifiedProduct` shape. This is
 * the ONE place that shape conversion happens for the internal catalog —
 * `CJDropshippingProvider` has its own normalizer for CJ's raw response
 * shape, but both converge on the same `UnifiedProduct` output type so no
 * provider-specific shape ever reaches a route handler.
 */
export function normalizeInternalProduct(record: ProductRecord, context: NormalizeContext = {}): UnifiedProduct {
  const countryRow = context.countryCode
    ? record.countryAvailability.find(
        (row) => row.countryCode === context.countryCode?.toUpperCase(),
      )
    : undefined;

  const price = countryRow?.price ?? record.basePrice;
  const currency = countryRow?.currency ?? record.baseCurrency;

  return {
    id: record.id,
    source: record.source,
    sourceProductId: record.sourceProductId,
    name: record.title,
    description: record.description,
    images: [...record.images].sort((a, b) => a.sortOrder - b.sortOrder).map((img) => img.url),
    price,
    currency,
    originalPrice: record.compareAtPrice,
    category: record.category ? { slug: record.category.slug, name: record.category.name } : null,
    countryAvailability: record.countryAvailability
      .filter((row) => row.isAvailable)
      .map((row) => row.countryCode),
    shipping: context.countryCode ? buildShippingEstimate(record, context) : null,
    rating: record.rating,
    ratingCount: record.ratingCount,
    // Placeholder — the Supplier system doesn't exist yet (later phase).
    // Never fabricated even though Product.supplierId exists in the schema.
    supplier: null,
    // Placeholder — the Affiliate commission engine doesn't exist yet (later phase).
    affiliateCommission: null,
    url: `/products/${record.slug}`,
  };
}

function buildShippingEstimate(
  record: ProductRecord,
  context: NormalizeContext,
): UnifiedProductShipping {
  const min = record.defaultShippingDays ?? FALLBACK_SHIPPING_DAYS_MIN;
  const max = record.defaultShippingDays
    ? record.defaultShippingDays + SHIPPING_DAYS_SPREAD
    : FALLBACK_SHIPPING_DAYS_MAX;
  return {
    countryCode: (context.countryCode ?? '').toUpperCase(),
    provider: context.shippingProviders?.[0] ?? null,
    estimatedDaysMin: min,
    estimatedDaysMax: max,
    cost: null,
    currency: null,
  };
}

export function normalizeCategory(record: CategoryRecord, isAvailable: boolean): CategorySummary {
  return {
    slug: record.slug,
    name: record.name,
    description: record.description,
    imageUrl: record.imageUrl,
    parentSlug: record.parentSlug,
    productCount: record.productCount,
    isAvailable,
  };
}
