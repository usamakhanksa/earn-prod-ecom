import type { ProductSort } from '@marketplace/shared';

export interface ProductImageRecord {
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface ProductVariantRecord {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  stock: number;
  attributes: Record<string, unknown> | null;
}

export interface ProductCountryRecord {
  countryCode: string;
  isAvailable: boolean;
  /** Country-specific price override. Null = use the product's basePrice. */
  price: number | null;
  currency: string | null;
}

export interface ProductCategoryRef {
  slug: string;
  name: string;
}

export interface ProductRecord {
  id: string;
  sku: string;
  slug: string;
  title: string;
  description: string | null;
  basePrice: number;
  baseCurrency: string;
  compareAtPrice: number | null;
  rating: number | null;
  ratingCount: number;
  /** Provenance: "internal" for this marketplace's own catalog. */
  source: string;
  sourceProductId: string | null;
  defaultShippingDays: number | null;
  isActive: boolean;
  category: ProductCategoryRef | null;
  supplierId: string | null;
  images: ProductImageRecord[];
  variants: ProductVariantRecord[];
  countryAvailability: ProductCountryRecord[];
}

export interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  parentSlug: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Count of active products whose primary category is this one. */
  productCount: number;
}

export interface ProductListFilter {
  categorySlug?: string | undefined;
  /**
   * Restrict results to products with an available `ProductCountry` row
   * for this country code. This is a plain data filter, not a business
   * rule — the DECISION of which countries/categories are restricted comes
   * from packages/marketplace-country's CountryProductRulesService, which
   * callers (the providers layer) consult before building this filter.
   */
  countryCode?: string | undefined;
  /** Category slugs to exclude — computed upstream from CountryConfig.restrictedCategorySlugs, never decided here. */
  excludeCategorySlugs?: string[] | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  minRating?: number | undefined;
  search?: string | undefined;
  sort?: ProductSort | undefined;
  page: number;
  limit: number;
}

export interface ProductListResult {
  items: ProductRecord[];
  total: number;
}

/**
 * Repository interface the product-search/catalog surfaces depend on.
 * `MockProductRepository` (in-memory, seeded — repositories/seed/catalog-seed-data.ts)
 * backs MOCK_MODE; `PrismaProductRepository` implements this exact interface
 * against Product/Category/ProductCountry/Inventory for later, real-DB use
 * (never exercised against a live database in this sandbox — see
 * docs/marketplace/DEBT.md).
 */
export interface ProductRepository {
  listProducts(filter: ProductListFilter): Promise<ProductListResult>;
  findProductBySlug(slug: string): Promise<ProductRecord | null>;
  findProductById(id: string): Promise<ProductRecord | null>;
  listCategories(): Promise<CategoryRecord[]>;
  findCategoryBySlug(slug: string): Promise<CategoryRecord | null>;
}
