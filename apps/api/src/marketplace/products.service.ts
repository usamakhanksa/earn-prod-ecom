import { Injectable, NotFoundException } from '@nestjs/common';
import type { MarketplaceProduct } from '@prisma/client';
import type { MarketplaceProductSummary } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface ListProductsQuery {
  country?: string | undefined;
  category?: string | undefined;
  supplier?: string | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** Storefront catalog (spec §8–§10). Products are country-filtered by
 * `shippingCountries` (empty = ships everywhere). */
@Injectable()
export class MarketplaceProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQuery): Promise<{ items: MarketplaceProductSummary[]; total: number; page: number; pageSize: number }> {
    const cc = query.country?.toUpperCase();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, query.pageSize ?? 24));

    const where = {
      isActive: true,
      status: 'ACTIVE',
      deletedAt: null,
      ...(cc !== undefined ? { OR: [{ shippingCountries: { has: cc } }, { shippingCountries: { isEmpty: true } }] } : {}),
      ...(query.category !== undefined ? { category: { slug: query.category } } : {}),
      ...(query.supplier !== undefined ? { supplierId: query.supplier } : {}),
      ...(query.search !== undefined && query.search.length > 0
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.marketplaceProduct.findMany({
        where,
        include: { category: { select: { id: true, slug: true, name: true } }, supplier: { select: { id: true, companyName: true, countryCode: true } } },
        orderBy: this.orderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.marketplaceProduct.count({ where }),
    ]);

    return { items: rows.map(toSummary), total, page, pageSize };
  }

  async getBySlug(slug: string): Promise<MarketplaceProductSummary> {
    const row = await this.prisma.marketplaceProduct.findFirst({
      where: { slug, isActive: true, status: 'ACTIVE', deletedAt: null },
      include: { category: { select: { id: true, slug: true, name: true } }, supplier: { select: { id: true, companyName: true, countryCode: true } } },
    });
    if (row === null) {
      throw new NotFoundException('Product not found');
    }
    return toSummary(row);
  }

  private orderBy(sort?: string) {
    switch (sort) {
      case 'price_asc':
        return { priceMinor: 'asc' as const };
      case 'price_desc':
        return { priceMinor: 'desc' as const };
      case 'rating':
        return { rating: 'desc' as const };
      case 'newest':
        return { createdAt: 'desc' as const };
      default:
        return { createdAt: 'desc' as const };
    }
  }
}

function toSummary(row: MarketplaceProduct & {
  category?: { id: string; slug: string; name: string } | null;
  supplier?: { id: string; companyName: string; countryCode: string } | null;
}): MarketplaceProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceMinor: row.priceMinor.toString(),
    originalPriceMinor: row.originalPriceMinor?.toString() ?? null,
    currency: row.currency,
    category: row.category ?? null,
    supplier: row.supplier ?? null,
    rating: Number(row.rating),
    ratingCount: row.ratingCount,
    images: asStringArray(row.images),
    shippingCountries: row.shippingCountries,
    shippingCostMinor: row.shippingCostMinor.toString(),
    estimatedDeliveryDays: row.estimatedDeliveryDays,
    source: row.source,
    isActive: row.isActive,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}