import { Injectable, NotFoundException } from '@nestjs/common';
import type { SyncJobView } from '@omnisell/shared';
import { SyncJobRepository } from '../../repositories/sync-job.repository';
import { ConnectorQueueService, QUEUE_CONNECTOR_SLUGS, type QueueConnectorSlug } from '../../queue/connector-queue.service';
import { ListingRepository } from '../../repositories/listing.repository';
import { AuditLogService } from '../../audit/audit-log.service';

function isQueueSlug(slug: string): slug is QueueConnectorSlug {
  return (QUEUE_CONNECTOR_SLUGS as readonly string[]).includes(slug);
}

/**
 * Sync jobs / DLQ / replay (implentationplanphase.md tasks 4.6/4.7,
 * featureslist.md 5.6/5.7). Real code backing both `GET /sync-jobs/:id`
 * (JSON snapshot AND the SSE stream — see `SyncJobsController`) and
 * one-click replay, built directly on `ConnectorQueueService`'s existing
 * DLQ/replay methods from Phase 3 (docs/DEBT.md 3-D4) rather than a second
 * queue mechanism.
 */
@Injectable()
export class SyncJobsService {
  constructor(
    private readonly syncJobs: SyncJobRepository,
    private readonly listings: ListingRepository,
    private readonly queue: ConnectorQueueService,
    private readonly audit: AuditLogService,
  ) {}

  async get(tenantId: string, id: string): Promise<SyncJobView> {
    const job = await this.syncJobs.findById(tenantId, id);
    if (job === null) {
      throw new NotFoundException('Sync job not found');
    }
    return toView(job);
  }

  async list(tenantId: string): Promise<SyncJobView[]> {
    const jobs = await this.syncJobs.list(tenantId);
    return Promise.all(jobs.map((j) => this.get(tenantId, j.id)));
  }

  /** DLQ view across every connector queue (5.7/14.7) — real BullMQ
   * `getFailed()` calls, empty in this sandbox (no Redis, docs/DEBT.md 3-D4)
   * rather than fabricated rows. */
  async listDeadLetterAcrossConnectors(): Promise<Array<{ connectorSlug: QueueConnectorSlug; jobs: Awaited<ReturnType<ConnectorQueueService['listFailed']>> }>> {
    const results = [];
    for (const slug of QUEUE_CONNECTOR_SLUGS) {
      results.push({ connectorSlug: slug, jobs: await this.queue.listFailed(slug) });
    }
    return results;
  }

  async replay(tenantId: string, syncJobId: string, userId: string): Promise<{ replayed: number }> {
    const job = await this.syncJobs.findById(tenantId, syncJobId);
    if (job === null) {
      throw new NotFoundException('Sync job not found');
    }
    let replayed = 0;
    for (const item of job.items) {
      if (item.status !== 'FAILED' && item.status !== 'DLQ') {
        continue;
      }
      const listing = await this.listings.findById(tenantId, item.listingId);
      if (listing === null || !isQueueSlug(listing.connectorSlug) || item.queueJobId === null) {
        continue;
      }
      const result = await this.queue.replay(listing.connectorSlug, item.queueJobId);
      if (result.replayed) {
        replayed += 1;
      }
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'sync_job.replayed', entityType: 'SyncJob', entityId: syncJobId, after: { replayed } });
    return { replayed };
  }
}

function toView(job: Awaited<ReturnType<SyncJobRepository['findById']>>): SyncJobView {
  if (job === null) {
    throw new NotFoundException('Sync job not found');
  }
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    totalItems: job.totalItems,
    completedItems: job.completedItems,
    failedItems: job.failedItems,
    items: job.items.map((i) => ({
      id: i.id,
      listingId: i.listingId,
      connectionId: i.connectionId,
      status: i.status,
      attempts: i.attempts,
      lastError: i.lastError,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}
