import { describe, expect, it } from 'vitest';
import { OfflineOrderQueue, type KeyValueStorage } from '../lib/offline-queue';

function makeFakeStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('OfflineOrderQueue (featureslist.md 6.13, task 5.13)', () => {
  it('enqueues a mutation and lists it back', async () => {
    const queue = new OfflineOrderQueue(makeFakeStorage());
    await queue.enqueue({ id: 'm1', method: 'POST', path: '/orders/o1/fulfil', body: {}, idempotencyKey: 'k1' });
    const items = await queue.list();
    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe('/orders/o1/fulfil');
  });

  it('flush() removes successfully-synced mutations', async () => {
    const queue = new OfflineOrderQueue(makeFakeStorage());
    await queue.enqueue({ id: 'm1', method: 'POST', path: '/orders/o1/fulfil', body: {}, idempotencyKey: 'k1' });
    const result = await queue.flush(async () => ({ ok: true }));
    expect(result.synced).toBe(1);
    expect(result.stillQueued).toBe(0);
    expect(await queue.list()).toHaveLength(0);
  });

  it('flush() leaves a network-failed mutation queued for the next attempt', async () => {
    const queue = new OfflineOrderQueue(makeFakeStorage());
    await queue.enqueue({ id: 'm1', method: 'POST', path: '/orders/o1/fulfil', body: {}, idempotencyKey: 'k1' });
    const result = await queue.flush(async () => ({ ok: false }));
    expect(result.stillQueued).toBe(1);
    expect(await queue.list()).toHaveLength(1);
  });

  it('flush() moves a 409 conflict out of the queue into conflicts, not retried', async () => {
    const queue = new OfflineOrderQueue(makeFakeStorage());
    await queue.enqueue({ id: 'm1', method: 'POST', path: '/orders/o1/cancel', body: {}, idempotencyKey: 'k1' });
    const result = await queue.flush(async () => ({ ok: false, status: 409 }));
    expect(result.stillQueued).toBe(0);
    expect(result.conflicted).toBe(1);
    expect(await queue.list()).toHaveLength(0);
    expect(await queue.listConflicts()).toHaveLength(1);
  });

  it('discardConflict() removes a resolved conflict', async () => {
    const queue = new OfflineOrderQueue(makeFakeStorage());
    await queue.enqueue({ id: 'm1', method: 'POST', path: '/orders/o1/cancel', body: {}, idempotencyKey: 'k1' });
    await queue.flush(async () => ({ ok: false, status: 409 }));
    await queue.discardConflict('m1');
    expect(await queue.listConflicts()).toHaveLength(0);
  });

  it('processes mutations in FIFO order and tracks attempts', async () => {
    const queue = new OfflineOrderQueue(makeFakeStorage());
    await queue.enqueue({ id: 'm1', method: 'POST', path: '/a', body: {}, idempotencyKey: 'k1' });
    await queue.enqueue({ id: 'm2', method: 'POST', path: '/b', body: {}, idempotencyKey: 'k2' });
    const seen: string[] = [];
    await queue.flush(async (m) => {
      seen.push(m.path);
      expect(m.attempts).toBe(1);
      return { ok: true };
    });
    expect(seen).toEqual(['/a', '/b']);
  });
});
