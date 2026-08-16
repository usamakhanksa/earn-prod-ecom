import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { redisConnectionOptions } from './redis-connection';

/** The only four connectors with a real adapter this phase (packages/connectors's
 * `ADAPTER_REGISTRY`) — one queue each, per prompt.md's "one queue per connector". */
export const QUEUE_CONNECTOR_SLUGS = ['printful', 'printify', 'gelato', 'prodigi'] as const;
export type QueueConnectorSlug = (typeof QUEUE_CONNECTOR_SLUGS)[number];

/** Per-connector worker concurrency (implentationplanphase.md task 3.6's
 * "concurrency config") — deliberately conservative defaults matched loosely
 * against each provider's documented rate limits (docs/CONNECTORS.md); real
 * production tuning is a Phase 4+ operational concern once real traffic
 * exists (Publishing is Phase 4). */
export const QUEUE_CONCURRENCY: Record<QueueConnectorSlug, number> = {
  printful: 5,
  printify: 5,
  gelato: 3,
  prodigi: 3,
};

export interface ConnectorJobData {
  tenantId: string;
  connectionId: string;
  kind: 'publish' | 'update' | 'unpublish' | 'sync-orders' | 'sync-blueprints' | 'submit-fulfilment';
  payload: unknown;
}

/**
 * BullMQ queue topology (prompt.md / implentationplanphase.md task 3.6): one
 * queue per connector + a shared dead-letter queue, real code against a real
 * `bullmq`/`ioredis` dependency — same honest-stub standard as Phase 1's
 * notification realtime gap and Phase 2's `NoopMockupRenderQueue` (docs/DEBT.md):
 * this CAN'T actually move a job through Redis in this sandbox (no Docker,
 * 0-D2/0-D5), but every method here is real, not a placeholder, and becomes
 * fully live the moment a reachable `REDIS_URL` exists — nothing about this
 * class changes at that point.
 *
 * Idempotency (prompt.md constraint #5's "queue consumer without an
 * idempotency guard" ban): every `enqueue*` call requires a caller-supplied
 * `jobId` — BullMQ deduplicates by `jobId` within a queue, so a retried
 * publish/sync request with the same key is a no-op, not a duplicate job.
 */
/** BullMQ rejects `:` in queue names — found by actually booting the compiled
 * app in this sandbox (real bug, fixed here; see docs/phases/PHASE_3_REPORT.md
 * "Bugs found"). `connector-${slug}` matches the existing `connector-dlq`
 * naming convention below. */
function queueName(slug: QueueConnectorSlug): string {
  return `connector-${slug}`;
}

@Injectable()
export class ConnectorQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectorQueueService.name);
  private readonly queues = new Map<QueueConnectorSlug, Queue<ConnectorJobData>>();
  private readonly dlq: Queue<ConnectorJobData>;
  private readonly workers: Worker[] = [];

  constructor() {
    this.dlq = new Queue<ConnectorJobData>('connector-dlq', { connection: redisConnectionOptions() });
    for (const slug of QUEUE_CONNECTOR_SLUGS) {
      this.queues.set(
        slug,
        new Queue<ConnectorJobData>(queueName(slug), {
          connection: redisConnectionOptions(),
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: { count: 500 },
            removeOnFail: false, // failed jobs stay queryable for DLQ replay
          },
        }),
      );
    }
  }

  private queueFor(slug: QueueConnectorSlug): Queue<ConnectorJobData> {
    const queue = this.queues.get(slug);
    if (queue === undefined) {
      throw new Error(`No queue registered for connector "${slug}"`);
    }
    return queue;
  }

  async enqueue(slug: QueueConnectorSlug, jobId: string, data: ConnectorJobData): Promise<{ jobId: string }> {
    const job = await this.queueFor(slug).add(data.kind, data, { jobId });
    return { jobId: job.id ?? jobId };
  }

  /** Failed jobs (per-connector queue, after exhausting `attempts`) — the
   * admin queue board's DLQ view (featureslist.md 14.7). */
  async listFailed(slug: QueueConnectorSlug, limit = 50): Promise<Array<{ id: string; failedReason: string | null; data: ConnectorJobData; attemptsMade: number }>> {
    const jobs = await this.queueFor(slug).getFailed(0, limit - 1);
    return jobs.map((job) => ({ id: job.id ?? '', failedReason: job.failedReason ?? null, data: job.data, attemptsMade: job.attemptsMade }));
  }

  /** One-click replay (featureslist.md 5.7/14.7) — retries a failed job in
   * place. Moving it to the separate `connector-dlq` queue first (for a
   * permanent audit trail even after replay) is the two-step flow a real
   * operator dashboard would use; kept as one step here since Publishing
   * (Phase 4) is what will actually generate these jobs. */
  async replay(slug: QueueConnectorSlug, jobId: string): Promise<{ replayed: boolean }> {
    const job = await this.queueFor(slug).getJob(jobId);
    if (job === undefined) {
      return { replayed: false };
    }
    await job.retry();
    return { replayed: true };
  }

  async moveToDlq(slug: QueueConnectorSlug, jobId: string): Promise<{ moved: boolean }> {
    const job = await this.queueFor(slug).getJob(jobId);
    if (job === undefined) {
      return { moved: false };
    }
    await this.dlq.add(job.name, job.data, { jobId: `${slug}:${jobId}` });
    await job.remove();
    return { moved: true };
  }

  /**
   * Starts a real BullMQ `Worker` for one connector queue at the configured
   * concurrency. NOT called anywhere during this app's normal bootstrap in
   * this sandbox — there is no reachable Redis to consume from, and starting
   * a `Worker` eagerly opens a blocking connection that would just retry
   * forever in the background. This method exists so the topology is complete
   * and callable (e.g. from a future dedicated worker process, or a Docker-
   * enabled integration test) without any further code changes.
   */
  startWorker(slug: QueueConnectorSlug, processor: Processor<ConnectorJobData>): Worker<ConnectorJobData> {
    const worker = new Worker<ConnectorJobData>(queueName(slug), processor, {
      connection: redisConnectionOptions(),
      concurrency: QUEUE_CONCURRENCY[slug],
    });
    worker.on('failed', (job: Job<ConnectorJobData> | undefined, error: Error) => {
      this.logger.warn(`Job ${job?.id ?? '?'} failed on ${queueName(slug)}: ${error.message}`);
    });
    this.workers.push(worker);
    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.map((w) => w.close()), ...[...this.queues.values()].map((q) => q.close()), this.dlq.close()]);
  }
}
