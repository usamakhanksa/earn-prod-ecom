import { describe, expect, it } from 'vitest';
import { createSyncJobStream } from '../src/publishing/sync-jobs/sync-job-stream';
import type { SyncJobView } from '@omnisell/shared';

function makeJob(status: string, completedItems: number): SyncJobView {
  return { id: 'job-1', kind: 'PUBLISH', status, totalItems: 2, completedItems, failedItems: 0, items: [], createdAt: '2026-08-12T00:00:00.000Z', completedAt: null };
}

describe('createSyncJobStream', () => {
  it('emits the initial snapshot immediately', async () => {
    const stream = createSyncJobStream(async () => makeJob('RUNNING', 0), { pollIntervalMs: 5 });
    const first = await new Promise<SyncJobView>((resolve) => {
      const sub = stream.subscribe((job) => {
        resolve(job);
        sub.unsubscribe();
      });
    });
    expect(first.status).toBe('RUNNING');
  });

  it('emits a new event only when the job actually changes, not on every poll tick', async () => {
    let call = 0;
    const fetchJob = async (): Promise<SyncJobView> => {
      call += 1;
      // Stays identical for the first 3 polls, then changes.
      return makeJob('RUNNING', call <= 3 ? 0 : 1);
    };
    const emissions: SyncJobView[] = [];
    await new Promise<void>((resolve) => {
      const sub = createSyncJobStream(fetchJob, { pollIntervalMs: 5 }).subscribe({
        next: (job) => {
          emissions.push(job);
          if (emissions.length === 2) {
            sub.unsubscribe();
            resolve();
          }
        },
      });
    });
    expect(emissions).toHaveLength(2);
    expect(emissions[0]?.completedItems).toBe(0);
    expect(emissions[1]?.completedItems).toBe(1);
    expect(call).toBeGreaterThanOrEqual(4); // proves it actually polled multiple times before the real change
  });

  it('completes the stream once the job reaches a terminal status', async () => {
    const stream = createSyncJobStream(async () => makeJob('COMPLETED', 2), { pollIntervalMs: 5 });
    const completed = await new Promise<boolean>((resolve) => {
      stream.subscribe({ complete: () => resolve(true) });
    });
    expect(completed).toBe(true);
  });

  it('completes after maxDurationMs even if the job never reaches a terminal status (no live worker in this sandbox)', async () => {
    const stream = createSyncJobStream(async () => makeJob('RUNNING', 0), { pollIntervalMs: 5, maxDurationMs: 20 });
    const completed = await new Promise<boolean>((resolve) => {
      stream.subscribe({ complete: () => resolve(true) });
    });
    expect(completed).toBe(true);
  });

  it('propagates a fetch error as a stream error rather than hanging silently', async () => {
    const stream = createSyncJobStream(async () => {
      throw new Error('db unreachable');
    }, { pollIntervalMs: 5 });
    const error = await new Promise<Error>((resolve) => {
      stream.subscribe({ error: (e) => resolve(e as Error) });
    });
    expect(error.message).toBe('db unreachable');
  });

  it('stops polling once unsubscribed', async () => {
    let call = 0;
    const stream = createSyncJobStream(async () => {
      call += 1;
      return makeJob('RUNNING', 0);
    }, { pollIntervalMs: 5 });
    const sub = stream.subscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));
    sub.unsubscribe();
    const callsAtUnsubscribe = call;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(call).toBe(callsAtUnsubscribe);
  });
});
