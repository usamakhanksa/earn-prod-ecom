import { Injectable, Logger } from '@nestjs/common';
import { ListingRepository } from '../../repositories/listing.repository';
import { PublishOrchestratorService } from '../publish-orchestrator.service';
import { isDue } from './scheduling.util';

/**
 * Scheduled publish sweep (featureslist.md 5.9, implentationplanphase.md
 * task 4.9). `runDueSweep` is real, callable logic — finds every DRAFT
 * listing whose `scheduledAt` (UTC) has arrived and publishes it — but
 * nothing invokes it on a recurring basis here (same Redis-adjacent
 * scheduling gap as `TokenRefreshService.runSweep`, docs/DEBT.md 3-D5): a
 * real deployment wires this to a BullMQ repeatable job once Redis is
 * reachable. The timezone/is-it-time-yet MATH itself
 * (`scheduling.util.ts`) is fully real and unit-tested independent of this
 * sweep's own scheduling gap.
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly listings: ListingRepository,
    private readonly orchestrator: PublishOrchestratorService,
  ) {}

  async runDueSweep(tenantId: string, systemUserId: string, nowUtc: Date = new Date()): Promise<{ published: number; failed: number }> {
    const due = await this.listings.findDueScheduled(tenantId, nowUtc);
    let published = 0;
    let failed = 0;
    for (const listing of due) {
      if (listing.scheduledAt === null || !isDue(nowUtc, listing.scheduledAt)) {
        continue; // defensive — the repository query already filters this
      }
      try {
        const outcome = await this.orchestrator.publishExistingListing(tenantId, systemUserId, listing.id);
        if (outcome.ok) {
          published += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(`Scheduled publish failed for listing ${listing.id}: ${String(error)}`);
      }
    }
    return { published, failed };
  }
}
