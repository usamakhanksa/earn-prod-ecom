/**
 * Offline order queue with conflict-safe sync on reconnect (featureslist.md
 * 6.13, task 5.13) — a genuinely new capability this phase, not present
 * anywhere else in `apps/mobile` yet. Pure, dependency-injected logic (a
 * `KeyValueStorage` interface, not a direct `AsyncStorage` import) so it is
 * fully unit-testable with `vitest` against an in-memory fake, matching this
 * codebase's every other mobile-logic-testing precedent (`apps/mobile`'s
 * `tsc` is independently broken by the pre-existing 1-D16 defect — `vitest`
 * is the real gate here, same as every prior phase's mobile work).
 *
 * Conflict handling: a queued mutation that fails with an HTTP 409 (e.g. an
 * illegal status transition because someone else already moved the order,
 * or an idempotency-key replay mismatch) is moved to `conflicts` rather than
 * retried forever or silently dropped — the UI surfaces these for a human
 * decision. A 5xx/network failure is left queued for the next flush.
 */

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface QueuedMutation {
  id: string;
  method: 'POST';
  path: string;
  body: unknown;
  idempotencyKey: string;
  createdAt: string;
  attempts: number;
}

export interface SendResult {
  ok: boolean;
  /** HTTP status if the request reached the server at all (undefined = pure network failure). */
  status?: number;
}

const STORAGE_KEY = 'omnisell.offline-order-queue.v1';
const CONFLICTS_KEY = 'omnisell.offline-order-queue.conflicts.v1';

export class OfflineOrderQueue {
  constructor(private readonly storage: KeyValueStorage) {}

  async enqueue(mutation: Omit<QueuedMutation, 'attempts' | 'createdAt'>): Promise<void> {
    const queue = await this.list();
    queue.push({ ...mutation, attempts: 0, createdAt: new Date().toISOString() });
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }

  async list(): Promise<QueuedMutation[]> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    try {
      return JSON.parse(raw) as QueuedMutation[];
    } catch {
      return [];
    }
  }

  async listConflicts(): Promise<QueuedMutation[]> {
    const raw = await this.storage.getItem(CONFLICTS_KEY);
    if (raw === null) return [];
    try {
      return JSON.parse(raw) as QueuedMutation[];
    } catch {
      return [];
    }
  }

  /** Sync-on-reconnect (task 5.13). Sends every queued mutation in FIFO
   * order via `send`; a 409 moves it to the conflicts list (never silently
   * dropped, never retried into a loop); any other failure leaves it queued
   * for the next flush; success removes it. Returns a summary so the UI can
   * show "3 synced, 1 needs your attention". */
  async flush(send: (mutation: QueuedMutation) => Promise<SendResult>): Promise<{ synced: number; conflicted: number; stillQueued: number }> {
    const queue = await this.list();
    const remaining: QueuedMutation[] = [];
    const conflicts = await this.listConflicts();
    let synced = 0;

    for (const mutation of queue) {
      const result = await send({ ...mutation, attempts: mutation.attempts + 1 });
      if (result.ok) {
        synced += 1;
        continue;
      }
      if (result.status === 409) {
        conflicts.push({ ...mutation, attempts: mutation.attempts + 1 });
        continue;
      }
      remaining.push({ ...mutation, attempts: mutation.attempts + 1 });
    }

    await this.storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    await this.storage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
    return { synced, conflicted: conflicts.length, stillQueued: remaining.length };
  }

  async discardConflict(id: string): Promise<void> {
    const conflicts = await this.listConflicts();
    await this.storage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts.filter((c) => c.id !== id)));
  }
}
