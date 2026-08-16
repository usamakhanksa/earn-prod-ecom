import { z } from 'zod';

/**
 * `UnifiedProduct` — the exact shape from the spec (sections 8-11/45-46).
 * Every `MarketplaceProvider` (MockMarketplaceProvider, CJDropshippingProvider,
 * ...) normalizes its provider-specific response into this shape before it
 * ever reaches a route handler — no provider-specific shape leaks past the
 * provider boundary in apps/marketplace-api/src/providers.
 *
 * `supplier` and `affiliateCommission` are typed here for the Supplier and
 * Affiliate systems that don't exist yet (later phases) — always `null` in
 * this phase's responses, never a fabricated value.
 */
export const unifiedProductCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
});

export type UnifiedProductCategory = z.infer<typeof unifiedProductCategorySchema>;

export const unifiedProductShippingSchema = z.object({
  countryCode: z.string().length(2),
  /** Carrier/provider id, e.g. "aramex" — sourced from that country's CountryConfig.shippingProviders. Null if unknown. */
  provider: z.string().nullable(),
  estimatedDaysMin: z.number().int().nonnegative(),
  estimatedDaysMax: z.number().int().nonnegative(),
  /** Null = shipping cost not modeled yet for this product/country pair. */
  cost: z.number().nullable(),
  currency: z.string().nullable(),
});

export type UnifiedProductShipping = z.infer<typeof unifiedProductShippingSchema>;

export const unifiedProductSupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type UnifiedProductSupplier = z.infer<typeof unifiedProductSupplierSchema>;

export const unifiedProductSchema = z.object({
  id: z.string(),
  /** Which MarketplaceProvider this row came from, e.g. "internal", "cj_dropshipping". */
  source: z.string(),
  /** This product's id in its source system. Null for internally-catalogued products. */
  sourceProductId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  images: z.array(z.string()),
  price: z.number(),
  currency: z.string(),
  /** Pre-discount price for showing a struck-through price + discount %. Null = no discount. */
  originalPrice: z.number().nullable(),
  category: unifiedProductCategorySchema.nullable(),
  /** 2-letter country codes this product is currently available in. */
  countryAvailability: z.array(z.string().length(2)),
  /** Null when no countryCode was supplied to the provider call this came from. */
  shipping: unifiedProductShippingSchema.nullable(),
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().nonnegative(),
  /** Placeholder — the Supplier system is a later phase. Always null this phase. */
  supplier: unifiedProductSupplierSchema.nullable(),
  /** Placeholder — the Affiliate commission engine is a later phase. Always null this phase. */
  affiliateCommission: z.number().nullable(),
  url: z.string().nullable(),
});

export type UnifiedProduct = z.infer<typeof unifiedProductSchema>;

export const paginatedProductsSchema = z.object({
  items: z.array(unifiedProductSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export type PaginatedProducts = z.infer<typeof paginatedProductsSchema>;

const coercedInt = () => z.coerce.number().int();
const coercedNumber = () => z.coerce.number();

export const PRODUCT_SORT_OPTIONS = ['relevance', 'price_asc', 'price_desc', 'rating'] as const;
export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number];

/** Zod validation for every `GET /products` query param, per the spec. */
export const productListQuerySchema = z.object({
  page: coercedInt().min(1).default(1),
  limit: coercedInt().min(1).max(100).default(20),
  category: z.string().trim().min(1).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'country must be a 2-letter ISO code')
    .optional(),
  minPrice: coercedNumber().min(0).optional(),
  maxPrice: coercedNumber().min(0).optional(),
  minRating: coercedNumber().min(0).max(5).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(PRODUCT_SORT_OPTIONS).optional(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
/** Same fields, but every one optional — this is what client callers pass in. */
export type ProductListQueryInput = Partial<ProductListQuery>;

export const productDetailQuerySchema = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'country must be a 2-letter ISO code')
    .optional(),
});

export type ProductDetailQuery = z.infer<typeof productDetailQuerySchema>;

/**
 * `CategorySummary` — what `GET /categories` and `GET /categories/:slug`
 * return. `isAvailable` reflects the country product rule engine
 * (packages/marketplace-country's CountryProductRulesService) when a
 * `country` query param was supplied; `true` (no restriction known) when it
 * wasn't.
 */
export const categorySummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  parentSlug: z.string().nullable(),
  productCount: z.number().int().nonnegative(),
  isAvailable: z.boolean(),
});

export type CategorySummary = z.infer<typeof categorySummarySchema>;

export const categoryListQuerySchema = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'country must be a 2-letter ISO code')
    .optional(),
});

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
