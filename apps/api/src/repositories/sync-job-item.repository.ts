import { Injectable } from '@nestjs/common';
import type { Prisma, SyncJobItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class SyncJobItemRepository extends TenantScopedRepository<Pick<PrismaService, 'syncJobItem'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createMany(rows: Prisma.SyncJobItemCreateManyInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.syncJobItem.createMany({ data: rows });
    return result.count;
  }

  async listForJob(tenantId: string, syncJobId: string): Promise<SyncJobItem[]> {
    return this.prisma.syncJobItem.findMany({ where: { tenantId, syncJobId }, orderBy: { createdAt: 'asc' } });
  }

  async findById(tenantId: string, id: string): Promise<SyncJobItem | null> {
    return this.prisma.syncJobItem.findFirst({ where: { id, tenantId } });
  }

  async findForListing(tenantId: string, listingId: string): Promise<SyncJobItem[]> {
    return this.prisma.syncJobItem.findMany({ where: { tenantId, listingId }, orderBy: { createdAt: 'desc' } });
  }

  async update(tenantId: string, id: string, data: Prisma.SyncJobItemUpdateInput): Promise<SyncJobItem | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.syncJobItem.update({ where: { id }, data });
  }

  async listFailed(tenantId: string, limit = 50): Promise<SyncJobItem[]> {
    return this.prisma.syncJobItem.findMany({ where: { tenantId, status: { in: ['FAILED', 'DLQ'] } }, orderBy: { updatedAt: 'desc' }, take: limit });
  }
}
