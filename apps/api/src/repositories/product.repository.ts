import { Injectable } from '@nestjs/common';
import type { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';
import type { ListProductsQuery } from '@omnisell/shared';

@Injectable()
export class ProductRepository extends TenantScopedRepository<Pick<PrismaService, 'product'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.ProductUncheckedCreateInput): Promise<Product> {
    return this.prisma.product.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { id, tenantId } });
  }

  async findBySku(tenantId: string, sku: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { tenantId, sku } });
  }

  async list(
    tenantId: string,
    query: ListProductsQuery,
  ): Promise<{ items: Array<Product & { variantCount: number; enabledVariantCount: number }>; nextCursor: string | null }> {
    const where: Prisma.ProductWhereInput = { tenantId };
    if (query.status !== undefined) {
      where.status = query.status;
    }
    if (query.search !== undefined) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor !== undefined ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { variants: { select: { isEnabled: true } } },
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const items = page.map((row) => ({
      ...row,
      variantCount: row.variants.length,
      enabledVariantCount: row.variants.filter((v) => v.isEnabled).length,
    }));
    return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async update(tenantId: string, id: string, data: Prisma.ProductUpdateInput): Promise<Product | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.product.update({ where: { id }, data });
  }

  async archive(tenantId: string, id: string): Promise<Product | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.product.update({ where: { id }, data: { status: 'ARCHIVED', isActive: false, archivedAt: new Date() } });
  }
}
