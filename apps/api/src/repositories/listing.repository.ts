import { Injectable } from '@nestjs/common';
import type { Listing, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export interface ListListingsFilter {
  status?: string;
  statuses?: string[];
  scheduledOnly?: boolean;
  productId?: string;
  connectionId?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListingRepository extends TenantScopedRepository<Pick<PrismaService, 'listing'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.ListingUncheckedCreateInput): Promise<Listing> {
    return this.prisma.listing.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Listing | null> {
    return this.prisma.listing.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  async softDelete(tenantId: string, id: string): Promise<Listing | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.listing.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async findManyByIds(tenantId: string, ids: string[]): Promise<Listing[]> {
    return this.prisma.listing.findMany({ where: { tenantId, id: { in: ids }, deletedAt: null } });
  }

  async list(tenantId: string, filter: ListListingsFilter): Promise<{ items: Listing[]; nextCursor: string | null }> {
    const where: Prisma.ListingWhereInput = { tenantId, deletedAt: null };
    if (filter.status !== undefined) {
      where.status = filter.status;
    }
    if (filter.statuses !== undefined) {
      where.status = { in: filter.statuses };
    }
    if (filter.scheduledOnly === true) {
      where.scheduledAt = { not: null };
    }
    if (filter.productId !== undefined) {
      where.productId = filter.productId;
    }
    if (filter.connectionId !== undefined) {
      where.connectionId = filter.connectionId;
    }
    const rows = await this.prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor !== undefined ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** Listings whose scheduled time has arrived and are still sitting in
   * DRAFT — what a real scheduler tick (4.9) would pick up. Real query,
   * never invoked by a live cron here (docs/DEBT.md — same Redis-adjacent
   * gap as the queue topology / token-refresh sweep). */
  async findDueScheduled(tenantId: string, nowUtc: Date): Promise<Listing[]> {
    return this.prisma.listing.findMany({
      where: { tenantId, status: 'DRAFT', scheduledAt: { not: null, lte: nowUtc } },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.ListingUpdateInput): Promise<Listing | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.listing.update({ where: { id }, data });
  }

  async countLiveForProduct(tenantId: string, productId: string): Promise<number> {
    return this.prisma.listing.count({ where: { tenantId, productId, status: { in: ['PENDING', 'QUEUED', 'LIVE'] } } });
  }
}
