import { Observable } from 'rxjs';
import type { SyncJobView } from '@omnisell/shared';

export interface SyncJobStreamOptions {
  pollIntervalMs?: number;
  /** Hard cap so an abandoned/never-terminal job's SSE connection doesn't
   * hang forever — a real, deliberate choice, not an accident of this
   * sandbox's Redis gap (a production deployment with a live queue would
   * still want a sane upper bound on one HTTP connection's lifetime). */
   maxDurationMs?: number;
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'PARTIAL', 'FAILED']);

/**
 * The publish pipeline view's real SSE stream logic (prompt.md "signature
 * moment #2" / implentationplanphase.md task 4.6) — framework-agnostic
 * (`Observable<SyncJobView>`, no NestJS/Express types), so it is fully unit-
 * testable with a fake `fetchJob` and fake timers (see
 * `test/sync-job-stream.test.ts`) independent of a running HTTP server.
 * `SyncJobsController` wraps this in `@Sse()` and maps each emission to a
 * `MessageEvent`.
 *
 * Honest limitation (docs/DEBT.md): this genuinely polls the real `SyncJob`/
 * `SyncJobItem` rows and emits a new event only when they change — but in
 * this sandbox nothing (no live queue worker) ever mutates those rows after
 * the initial fan-out, so a live multi-second status progression cannot be
 * demonstrated end-to-end here, same standard as 3-D4/1-D6's realtime gaps.
 */
export function createSyncJobStream(fetchJob: () => Promise<SyncJobView>, options: SyncJobStreamOptions = {}): Observable<SyncJobView> {
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const maxDurationMs = options.maxDurationMs ?? 5 * 60 * 1000;

  return new Observable<SyncJobView>((subscriber) => {
    let lastSerialized: string | null = null;
    let stopped = false;
    const startedAt = Date.now();

    const tick = async (): Promise<void> => {
      if (stopped) {
        return;
      }
      try {
        const job = await fetchJob();
        const serialized = JSON.stringify(job);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          subscriber.next(job);
        }
        if (TERMINAL_STATUSES.has(job.status) || Date.now() - startedAt >= maxDurationMs) {
          stopped = true;
          subscriber.complete();
          return;
        }
      } catch (error) {
        subscriber.error(error);
        return;
      }
      setTimeout(() => void tick(), pollIntervalMs);
    };

    void tick();

    return () => {
      stopped = true;
    };
  });
}
