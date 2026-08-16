import type { CategorySummary, ProductSort, UnifiedProduct, UnifiedProductShipping } from '@marketplace/shared';

export interface ProductSearchParams {
  query?: string | undefined;
  categorySlug?: string | undefined;
  countryCode?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  minRating?: number | undefined;
  sort?: ProductSort | undefined;
  page: number;
  limit: number;
}

export interface ProductSearchResult {
  items: UnifiedProduct[];
  total: number;
  page: number;
  limit: number;
}

export interface AvailabilityResult {
  productId: string;
  countryCode: string;
  available: boolean;
  /** Aggregate stock across variants for this country, or null when stock isn't tracked. */
  stock: number | null;
}

export interface PricingResult {
  productId: string;
  countryCode: string;
  price: number;
  currency: string;
  originalPrice: number | null;
}

export type ShippingResult = UnifiedProductShipping;

/**
 * `MarketplaceProvider` — exactly per the spec (sections 8-11): the single
 * abstraction every product source (this marketplace's own catalog, CJ
 * Dropshipping, and any future supplier feed) implements. Every method
 * returns the normalized `UnifiedProduct`/`CategorySummary` shape from
 * @marketplace/shared — no provider-specific response shape is ever allowed
 * to leak past this boundary into a route handler.
 */
export interface MarketplaceProvider {
  /** Human-readable id, surfaced in logs/health checks (e.g. "mock", "cj_dropshipping"). */
  readonly id: string;
  searchProducts(params: ProductSearchParams): Promise<ProductSearchResult>;
  getProduct(idOrSlug: string, countryCode?: string): Promise<UnifiedProduct | null>;
  getCategories(countryCode?: string): Promise<CategorySummary[]>;
  getAvailability(productId: string, countryCode: string): Promise<AvailabilityResult>;
  getPricing(productId: string, countryCode: string): Promise<PricingResult>;
  getShipping(productId: string, countryCode: string): Promise<ShippingResult>;
}

/**
 * Thrown by a provider whose required credentials aren't configured (e.g.
 * `CJDropshippingProvider` with no `CJ_API_KEY`). This is the same honest
 * "not configured" gate OmniSell's own connector adapters use for missing
 * credentials — never a silent fallback to mock data, never a crash with an
 * unclear stack trace. Mapped to HTTP 503 by the error handler.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(providerId: string, missingEnvVar: string) {
    super(
      `MarketplaceProvider "${providerId}" is not configured — set ${missingEnvVar} before using it.`,
    );
    this.name = 'ProviderNotConfiguredError';
  }
}
