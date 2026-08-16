import { Injectable } from '@nestjs/common';
import type { PeriodLock } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Period close / lock (Phase 6, task 6.6). */
@Injectable()
export class PeriodLockRepository extends TenantScopedRepository<Pick<PrismaService, 'periodLock'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async list(tenantId: string): Promise<PeriodLock[]> {
    return this.prisma.periodLock.findMany({ where: { tenantId }, orderBy: { periodStart: 'desc' } });
  }

  /** Every LOCKED period covering ANY part of `[from, to]` — used by
   * `LedgerService` to decide whether a non-adjustment posting must be
   * rejected. */
  async findLockedOverlapping(tenantId: string, from: Date, to: Date): Promise<PeriodLock[]> {
    return this.prisma.periodLock.findMany({
      where: { tenantId, status: 'LOCKED', periodStart: { lte: to }, periodEnd: { gte: from } },
    });
  }

  async lock(tenantId: string, periodStart: Date, periodEnd: Date, lockedById: string): Promise<PeriodLock> {
    return this.prisma.periodLock.upsert({
      where: { tenantId_periodStart_periodEnd: { tenantId, periodStart, periodEnd } },
      create: { tenantId, periodStart, periodEnd, status: 'LOCKED', lockedById, lockedAt: new Date() },
      update: { status: 'LOCKED', lockedById, lockedAt: new Date() },
    });
  }

  async unlock(tenantId: string, id: string): Promise<PeriodLock | null> {
    const existing = await this.prisma.periodLock.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.periodLock.update({ where: { id }, data: { status: 'OPEN', lockedById: null, lockedAt: null } });
  }
}
