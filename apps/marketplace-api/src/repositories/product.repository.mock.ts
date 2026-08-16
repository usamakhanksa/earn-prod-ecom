import {
  CATEGORY_SEED,
  PRODUCT_SEED,
  type ProductSeedInput,
} from './seed/catalog-seed-data.js';
import type {
  CategoryRecord,
  ProductListFilter,
  ProductListResult,
  ProductRecord,
  ProductRepository,
} from './product.repository.js';

/**
 * In-memory ProductRepository — active whenever MOCK_MODE=true (the actual
 * state of this sandbox). Seeded once at construction from
 * repositories/seed/catalog-seed-data.ts (~40 products across 8
 * categories, varied by country availability) and never mutated afterward
 * — this phase has no write surface (admin catalog CRUD is a later phase).
 */
export class MockProductRepository implements ProductRepository {
  private readonly products: ProductRecord[];
  private readonly categories: CategoryRecord[];

  constructor(
    categorySeed: readonly { slug: string; name: string; description: string; imageUrl: string; sortOrder: number }[] = CATEGORY_SEED,
    productSeed: readonly ProductSeedInput[] = PRODUCT_SEED,
  ) {
    this.categories = categorySeed.map((c, index) => ({
      id: `cat-${c.slug}`,
      slug: c.slug,
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl,
      parentSlug: null,
      isActive: true,
      sortOrder: c.sortOrder ?? index,
      productCount: 0,
    }));

    this.products = productSeed.map((p) => this.buildProductRecord(p));

    const countBySlug = new Map<string, number>();
    for (const product of this.products) {
      if (!product.category) continue;
      countBySlug.set(product.category.slug, (countBySlug.get(product.category.slug) ?? 0) + 1);
    }
    for (const category of this.categories) {
      category.productCount = countBySlug.get(category.slug) ?? 0;
    }
  }

  private buildProductRecord(p: ProductSeedInput): ProductRecord {
    const category = this.categories.find((c) => c.slug === p.categorySlug);
    return {
      id: `prod-${p.slug}`,
      sku: p.sku,
      slug: p.slug,
      title: p.title,
      description: p.description,
      basePrice: p.basePrice,
      baseCurrency: p.baseCurrency ?? 'USD',
      compareAtPrice: p.compareAtPrice ?? null,
      rating: p.rating ?? null,
      ratingCount: p.ratingCount ?? 0,
      source: 'internal',
      sourceProductId: null,
      defaultShippingDays: p.defaultShippingDays ?? null,
      isActive: true,
      category: category ? { slug: category.slug, name: category.name } : null,
      supplierId: null,
      images: p.images.map((img, index) => ({
        url: img.url,
        altText: img.altText ?? p.title,
        sortOrder: index,
      })),
      variants: (p.variants ?? []).map((v, index) => ({
        id: `variant-${p.slug}-${index}`,
        sku: v.sku,
        name: v.name,
        price: v.price,
        currency: v.currency ?? p.baseCurrency ?? 'USD',
        stock: v.stock,
        attributes: v.attributes ?? null,
      })),
      countryAvailability: p.countryAvailability.map((row) => ({
        countryCode: row.countryCode.toUpperCase(),
        isAvailable: row.isAvailable ?? true,
        price: row.price ?? null,
        currency: row.currency ?? null,
      })),
    };
  }

  async listProducts(filter: ProductListFilter): Promise<ProductListResult> {
    let items = this.products.filter((p) => p.isActive);

    if (filter.categorySlug) {
      items = items.filter((p) => p.category?.slug === filter.categorySlug);
    }
    if (filter.excludeCategorySlugs && filter.excludeCategorySlugs.length > 0) {
      const excluded = new Set(filter.excludeCategorySlugs);
      items = items.filter((p) => !p.category || !excluded.has(p.category.slug));
    }
    if (filter.countryCode) {
      const code = filter.countryCode.toUpperCase();
      items = items.filter((p) =>
        p.countryAvailability.some((row) => row.countryCode === code && row.isAvailable),
      );
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.category?.name.toLowerCase().includes(q) ?? false),
      );
    }
    if (filter.minPrice !== undefined) {
      items = items.filter((p) => effectivePrice(p, filter.countryCode) >= filter.minPrice!);
    }
    if (filter.maxPrice !== undefined) {
      items = items.filter((p) => effectivePrice(p, filter.countryCode) <= filter.maxPrice!);
    }
    if (filter.minRating !== undefined) {
      items = items.filter((p) => (p.rating ?? 0) >= filter.minRating!);
    }

    items = sortProducts(items, filter.sort, filter.countryCode);

    const total = items.length;
    const start = (filter.page - 1) * filter.limit;
    const page = items.slice(start, start + filter.limit).map(cloneProduct);

    return { items: page, total };
  }

  async findProductBySlug(slug: string): Promise<ProductRecord | null> {
    const found = this.products.find((p) => p.slug === slug && p.isActive);
    return found ? cloneProduct(found) : null;
  }

  async findProductById(id: string): Promise<ProductRecord | null> {
    const found = this.products.find((p) => p.id === id && p.isActive);
    return found ? cloneProduct(found) : null;
  }

  async listCategories(): Promise<CategoryRecord[]> {
    return this.categories.map((c) => ({ ...c }));
  }

  async findCategoryBySlug(slug: string): Promise<CategoryRecord | null> {
    const found = this.categories.find((c) => c.slug === slug);
    return found ? { ...found } : null;
  }
}

function effectivePrice(product: ProductRecord, countryCode?: string): number {
  if (countryCode) {
    const row = product.countryAvailability.find(
      (r) => r.countryCode === countryCode.toUpperCase(),
    );
    if (row?.price !== null && row?.price !== undefined) {
      return row.price;
    }
  }
  return product.basePrice;
}

function sortProducts(
  items: ProductRecord[],
  sort: ProductListFilter['sort'],
  countryCode?: string,
): ProductRecord[] {
  const sorted = [...items];
  switch (sort) {
    case 'price_asc':
      return sorted.sort((a, b) => effectivePrice(a, countryCode) - effectivePrice(b, countryCode));
    case 'price_desc':
      return sorted.sort((a, b) => effectivePrice(b, countryCode) - effectivePrice(a, countryCode));
    case 'rating':
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    default:
      // "relevance" (default): stable seed order, matching a search-ranked
      // catalog's natural order in the absence of a real search index.
      return sorted;
  }
}

function cloneProduct(p: ProductRecord): ProductRecord {
  return {
    ...p,
    category: p.category ? { ...p.category } : null,
    images: p.images.map((i) => ({ ...i })),
    variants: p.variants.map((v) => ({ ...v, attributes: v.attributes ? { ...v.attributes } : null })),
    countryAvailability: p.countryAvailability.map((c) => ({ ...c })),
  };
}
