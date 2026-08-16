import { Injectable } from '@nestjs/common';
import type { ListingFieldOverride, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ListingFieldOverrideRepository extends TenantScopedRepository<Pick<PrismaService, 'listingFieldOverride'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async upsert(tenantId: string, listingId: string, fieldKey: string, valueJson: Prisma.InputJsonValue): Promise<ListingFieldOverride> {
    return this.prisma.listingFieldOverride.upsert({
      where: { listingId_fieldKey: { listingId, fieldKey } },
      update: { valueJson },
      create: { tenantId, listingId, fieldKey, valueJson },
    });
  }

  async listForListing(tenantId: string, listingId: string): Promise<ListingFieldOverride[]> {
    return this.prisma.listingFieldOverride.findMany({ where: { tenantId, listingId } });
  }
}
