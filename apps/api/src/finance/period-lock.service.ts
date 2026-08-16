import { Injectable } from '@nestjs/common';
import type { PeriodLock } from '@prisma/client';
import { PeriodLockRepository } from '../repositories/period-lock.repository';

/**
 * Period close / lock (Phase 6, task 6.6). The actual ENFORCEMENT — rejecting
 * a non-adjustment posting whose date falls in a locked period — lives in
 * `LedgerService.postBalancedEntry` (the one place every posting funnels
 * through); this service just owns the lock/unlock lifecycle itself.
 */
@Injectable()
export class PeriodLockService {
  constructor(private readonly locks: PeriodLockRepository) {}

  async list(tenantId: string): Promise<PeriodLock[]> {
    return this.locks.list(tenantId);
  }

  async lock(tenantId: string, periodStart: Date, periodEnd: Date, actorId: string): Promise<PeriodLock> {
    return this.locks.lock(tenantId, periodStart, periodEnd, actorId);
  }

  async unlock(tenantId: string, id: string): Promise<PeriodLock | null> {
    return this.locks.unlock(tenantId, id);
  }
}
