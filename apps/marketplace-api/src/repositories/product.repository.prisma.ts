import type { PrismaClient, Prisma } from '../generated/prisma-client/index.js';
import type {
  CategoryRecord,
  ProductListFilter,
  ProductListResult,
  ProductRecord,
  ProductRepository,
} from './product.repository.js';

/**
 * Real, Postgres-backed ProductRepository implementing the exact same
 * interface as MockProductRepository. Never exercised against a live
 * database in this sandbox (see docs/marketplace/DEBT.md — only
 * `prisma validate`/`prisma generate`/`prisma migrate diff` were run for
 * real against this schema).
 *
 * Known, documented limitation (see DEBT.md): `minPrice`/`maxPrice`/
 * `sort=price_*` filter/sort against `Product.basePrice` only — they do
 * NOT account for a `ProductCountry.price` override the way
 * MockProductRepository's `effectivePrice()` helper does. Doing this
 * correctly in SQL needs either a computed column or a raw query joining
 * the matching `ProductCountry` row; not built this pass since it can't be
 * exercised against a real database here anyway.
 */
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listProducts(filter: ProductListFilter): Promise<ProductListResult> {
    // Built as a list of independent AND-ed conditions (rather than
    // mutating a shared `where.OR`) so the "category restriction" OR-clause
    // and the "search text" OR-clause can never collide with each other.
    const and: Prisma.ProductWhereInput[] = [{ isActive: true }];

    if (filter.categorySlug) {
      and.push({
        category: {
          is: {
            slug: filter.categorySlug,
            ...(filter.excludeCategorySlugs && filter.excludeCategorySlugs.length > 0
              ? { NOT: { slug: { in: filter.excludeCategorySlugs } } }
              : {}),
          },
        },
      });
    } else if (filter.excludeCategorySlugs && filter.excludeCategorySlugs.length > 0) {
      // No specific category requested — exclude restricted categories but
      // keep uncategorized products (a category restriction can't apply to
      // a product that has no category).
      and.push({
        OR: [
          { categoryId: null },
          { category: { is: { slug: { notIn: filter.excludeCategorySlugs } } } },
        ],
      });
    }

    if (filter.countryCode) {
      and.push({
        countryAvailability: {
          some: { countryCode: filter.countryCode.toUpperCase(), isAvailable: true },
        },
      });
    }

    if (filter.search) {
      and.push({
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' } },
          { description: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      and.push({
        basePrice: {
          ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
          ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
        },
      });
    }

    if (filter.minRating !== undefined) {
      and.push({ rating: { gte: filter.minRating } });
    }

    const where: Prisma.ProductWhereInput = { AND: and };
    const orderBy = resolveOrderBy(filter.sort);

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items: rows.map(toProductRecord), total };
  }

  async findProductBySlug(slug: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: productInclude,
    });
    return row ? toProductRecord(row) : null;
  }

  async findProductById(id: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      include: productInclude,
    });
    return row ? toProductRecord(row) : null;
  }

  async listCategories(): Promise<CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { parent: true, _count: { select: { products: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toCategoryRecord);
  }

  async findCategoryBySlug(slug: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findUnique({
      where: { slug },
      include: { parent: true, _count: { select: { products: true } } },
    });
    return row ? toCategoryRecord(row) : null;
  }
}

const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: true,
  countryAvailability: true,
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    title: row.title,
    description: row.description,
    basePrice: Number(row.basePrice),
    baseCurrency: row.baseCurrency,
    compareAtPrice: row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
    rating: row.rating !== null ? Number(row.rating) : null,
    ratingCount: row.ratingCount,
    source: row.source,
    sourceProductId: row.sourceProductId,
    defaultShippingDays: row.defaultShippingDays,
    isActive: row.isActive,
    category: row.category ? { slug: row.category.slug, name: row.category.name } : null,
    supplierId: row.supplierId,
    images: row.images.map((img) => ({
      url: img.url,
      altText: img.altText,
      sortOrder: img.sortOrder,
    })),
    variants: row.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      price: Number(v.price),
      currency: v.currency,
      stock: v.stock,
      attributes: (v.attributes as Record<string, unknown> | null) ?? null,
    })),
    countryAvailability: row.countryAvailability.map((c) => ({
      countryCode: c.countryCode,
      isAvailable: c.isAvailable,
      price: c.price !== null ? Number(c.price) : null,
      currency: c.currency,
    })),
  };
}

type CategoryRow = Prisma.CategoryGetPayload<{
  include: { parent: true; _count: { select: { products: true } } };
}>;

function toCategoryRecord(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    parentSlug: row.parent?.slug ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    productCount: row._count.products,
  };
}

function resolveOrderBy(
  sort: ProductListFilter['sort'],
): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'rating':
      return { rating: 'desc' };
    default:
      return { createdAt: 'asc' };
  }
}
