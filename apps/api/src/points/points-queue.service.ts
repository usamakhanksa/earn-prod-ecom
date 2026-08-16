import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { redisConnectionOptions } from '../queue/redis-connection';

export interface PointsAwardJobData {
  tenantId: string;
  watchId: string;
  points: number;
  expiresAtIso: string | null;
}

/**
 * BullMQ queue for async points-award validation (docs/points-extension.md
 * §14/§4, task 4.5.4's "async validation worker ... idempotent, DLQ") — same
 * topology pattern as `ConnectorQueueService` (Phase 3): one queue, a
 * dedicated DLQ, `jobId` deduplication for idempotency (`jobId = watchId`,
 * so a retried enqueue for the same watch is a BullMQ no-op, not a duplicate
 * job), and a real `startWorker()` that is never invoked during this
 * sandbox's normal bootstrap (no reachable Redis — same class of gap as
 * 0-D5/3-D4). `VideoWatchService.complete()` calls `enqueueValidation` and,
 * on failure (the expected outcome here), falls back to running the exact
 * same validation logic inline — see that file's class doc comment.
 */
@Injectable()
export class PointsQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(PointsQueueService.name);
  private readonly queue: Queue<PointsAwardJobData>;
  private readonly dlq: Queue<PointsAwardJobData>;
  private worker: Worker<PointsAwardJobData> | null = null;

  constructor() {
    this.queue = new Queue<PointsAwardJobData>('points-award-validation', {
      connection: redisConnectionOptions(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
    });
    this.dlq = new Queue<PointsAwardJobData>('points-award-dlq', { connection: redisConnectionOptions() });
  }

  async enqueueValidation(data: PointsAwardJobData): Promise<{ jobId: string }> {
    const job = await this.queue.add('validate', data, { jobId: data.watchId });
    return { jobId: job.id ?? data.watchId };
  }

  async listFailed(limit = 50) {
    const jobs = await this.queue.getFailed(0, limit - 1);
    return jobs.map((job) => ({ id: job.id ?? '', failedReason: job.failedReason ?? null, data: job.data, attemptsMade: job.attemptsMade }));
  }

  async moveToDlq(jobId: string): Promise<{ moved: boolean }> {
    const job = await this.queue.getJob(jobId);
    if (job === undefined) {
      return { moved: false };
    }
    await this.dlq.add(job.name, job.data, { jobId: `dlq:${jobId}` });
    await job.remove();
    return { moved: true };
  }

  /** Real, callable — not invoked during this sandbox's bootstrap (see class
   * doc comment). Wire this from a dedicated worker process once Redis is
   * reachable, passing `videoWatchService.awardIfEligible`-shaped logic as
   * `processor`. */
  startWorker(processor: Processor<PointsAwardJobData>): Worker<PointsAwardJobData> {
    this.worker = new Worker<PointsAwardJobData>('points-award-validation', processor, {
      connection: redisConnectionOptions(),
    });
    this.worker.on('failed', (job: Job<PointsAwardJobData> | undefined, error: Error) => {
      this.logger.warn(`Points award job ${job?.id ?? '?'} failed: ${error.message}`);
    });
    return this.worker;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.worker?.close() ?? Promise.resolve(), this.queue.close(), this.dlq.close()]);
  }
}
