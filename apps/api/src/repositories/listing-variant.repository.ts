import { Injectable } from '@nestjs/common';
import type { ListingVariant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ListingVariantRepository extends TenantScopedRepository<Pick<PrismaService, 'listingVariant'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createMany(rows: Prisma.ListingVariantCreateManyInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.listingVariant.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  async listForListing(tenantId: string, listingId: string): Promise<ListingVariant[]> {
    return this.prisma.listingVariant.findMany({ where: { tenantId, listingId } });
  }

  async findById(tenantId: string, id: string): Promise<ListingVariant | null> {
    return this.prisma.listingVariant.findFirst({ where: { id, tenantId } });
  }

  async update(tenantId: string, id: string, data: Prisma.ListingVariantUpdateInput): Promise<ListingVariant | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.listingVariant.update({ where: { id }, data });
  }

  async updateStatusForListing(tenantId: string, listingId: string, status: string): Promise<number> {
    const result = await this.prisma.listingVariant.updateMany({ where: { tenantId, listingId }, data: { status } });
    return result.count;
  }
}
