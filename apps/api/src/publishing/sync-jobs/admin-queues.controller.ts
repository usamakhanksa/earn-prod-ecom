import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SyncJobsService } from './sync-jobs.service';
import { ConnectorQueueService, QUEUE_CONNECTOR_SLUGS, type QueueConnectorSlug } from '../../queue/connector-queue.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../../admin/admin-only.guard';

function isQueueSlug(slug: string): slug is QueueConnectorSlug {
  return (QUEUE_CONNECTOR_SLUGS as readonly string[]).includes(slug);
}

/**
 * Admin "Jobs & Queues" board (README.md §5 — "BullMQ boards per connector:
 * inspect, retry, drain, replay DLQ, tune concurrency"). Platform-wide, not
 * tenant-scoped — a connector queue's jobs span every tenant, so this is
 * `AdminOnlyGuard`-gated, not `TenantContextGuard`-gated. Built directly on
 * `ConnectorQueueService`'s real DLQ/replay methods from Phase 3
 * (docs/DEBT.md 3-D4) — empty results in this sandbox (no Redis), not
 * fabricated rows.
 */
@Controller('admin/queues')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminQueuesController {
  constructor(
    private readonly syncJobs: SyncJobsService,
    private readonly queue: ConnectorQueueService,
  ) {}

  @Get('dead-letter')
  async deadLetter() {
    return this.syncJobs.listDeadLetterAcrossConnectors();
  }

  @Post(':slug/jobs/:jobId/replay')
  async replay(@Param('slug') slug: string, @Param('jobId') jobId: string): Promise<{ replayed: boolean }> {
    if (!isQueueSlug(slug)) {
      return { replayed: false };
    }
    return this.queue.replay(slug, jobId);
  }
}
