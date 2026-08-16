import { Injectable } from '@nestjs/common';
import type { Prisma, ProductVariant, VariantPrice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Variant matrix (featureslist.md 3.3) + its per-channel/currency computed
 * prices (VariantPrice, 3.6/3.7) — covered by one repository since a variant
 * is never meaningfully read without its current prices. */
@Injectable()
export class ProductVariantRepository extends TenantScopedRepository<Pick<PrismaService, 'productVariant'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createMany(rows: Prisma.ProductVariantCreateManyInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.productVariant.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  async listForProduct(tenantId: string, productId: string): Promise<Array<ProductVariant & { prices: VariantPrice[] }>> {
    return this.prisma.productVariant.findMany({
      where: { tenantId, productId },
      include: { prices: true },
      orderBy: [{ size: 'asc' }, { color: 'asc' }],
    });
  }

  async findExistingCombos(tenantId: string, productId: string): Promise<Set<string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: { tenantId, productId },
      select: { size: true, color: true },
    });
    return new Set(rows.map((r) => `${r.size ?? ''}::${r.color ?? ''}`));
  }

  async findById(tenantId: string, id: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findFirst({ where: { id, tenantId } });
  }

  async bulkSetEnabled(tenantId: string, variantIds: string[], isEnabled: boolean): Promise<number> {
    const result = await this.prisma.productVariant.updateMany({
      where: { tenantId, id: { in: variantIds } },
      data: { isEnabled },
    });
    return result.count;
  }

  async update(tenantId: string, id: string, data: Prisma.ProductVariantUpdateInput): Promise<ProductVariant | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.productVariant.update({ where: { id }, data });
  }

  async countEnabledForProduct(tenantId: string, productId: string): Promise<number> {
    return this.prisma.productVariant.count({ where: { tenantId, productId, isEnabled: true } });
  }

  async upsertPrice(input: {
    tenantId: string;
    variantId: string;
    channel: string;
    currency: string;
    priceMinor: bigint;
    compareAtMinor?: bigint | null;
    marginPct?: number | null;
    pricingRuleId?: string | null;
  }): Promise<VariantPrice> {
    return this.prisma.variantPrice.upsert({
      where: { variantId_channel_currency: { variantId: input.variantId, channel: input.channel, currency: input.currency } },
      update: {
        priceMinor: input.priceMinor,
        compareAtMinor: input.compareAtMinor ?? null,
        marginPct: input.marginPct ?? null,
        pricingRuleId: input.pricingRuleId ?? null,
        computedAt: new Date(),
      },
      create: {
        tenantId: input.tenantId,
        variantId: input.variantId,
        channel: input.channel,
        currency: input.currency,
        priceMinor: input.priceMinor,
        compareAtMinor: input.compareAtMinor ?? null,
        marginPct: input.marginPct ?? null,
        pricingRuleId: input.pricingRuleId ?? null,
      },
    });
  }
}
