import { Injectable } from '@nestjs/common';
import type { ListingEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Activity timeline (5.13) AND the approval comment thread (5.10) — see the
 * schema comment on `ListingEvent`. */
@Injectable()
export class ListingEventRepository extends TenantScopedRepository<Pick<PrismaService, 'listingEvent'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async record(data: Prisma.ListingEventUncheckedCreateInput): Promise<ListingEvent> {
    return this.prisma.listingEvent.create({ data });
  }

  async listForListing(tenantId: string, listingId: string, limit = 100): Promise<ListingEvent[]> {
    return this.prisma.listingEvent.findMany({
      where: { tenantId, listingId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
