import { Injectable } from '@nestjs/common';
import type { Prisma, SyncJob, SyncJobItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class SyncJobRepository extends TenantScopedRepository<Pick<PrismaService, 'syncJob'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.SyncJobUncheckedCreateInput): Promise<SyncJob> {
    return this.prisma.syncJob.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<(SyncJob & { items: SyncJobItem[] }) | null> {
    return this.prisma.syncJob.findFirst({ where: { id, tenantId }, include: { items: true } });
  }

  async list(tenantId: string, limit = 50): Promise<SyncJob[]> {
    return this.prisma.syncJob.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: limit });
  }

  async update(tenantId: string, id: string, data: Prisma.SyncJobUpdateInput): Promise<SyncJob | null> {
    const existing = await this.prisma.syncJob.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.syncJob.update({ where: { id }, data });
  }

  /** Re-derives the parent job's counters + terminal status from its items —
   * called after every item transition so the job's own status is always a
   * real aggregate, never a value that can drift from its items. */
  async recomputeCounters(tenantId: string, id: string): Promise<SyncJob | null> {
    const items = await this.prisma.syncJobItem.findMany({ where: { tenantId, syncJobId: id } });
    const completedItems = items.filter((i) => i.status === 'SUCCEEDED').length;
    const failedItems = items.filter((i) => i.status === 'FAILED' || i.status === 'DLQ').length;
    const stillRunning = items.some((i) => i.status === 'QUEUED' || i.status === 'RUNNING');
    const status = stillRunning ? 'RUNNING' : failedItems === 0 ? 'COMPLETED' : completedItems === 0 ? 'FAILED' : 'PARTIAL';
    return this.update(tenantId, id, {
      completedItems,
      failedItems,
      status,
      ...(stillRunning ? {} : { completedAt: new Date() }),
    });
  }
}
