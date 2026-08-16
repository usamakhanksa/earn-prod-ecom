import type { RedisOptions } from 'ioredis';
import { env } from '../config/env';

/**
 * Shared ioredis connection options for every BullMQ `Queue`/`Worker` in
 * `apps/api/src/queue` (implentationplanphase.md task 3.6). `lazyConnect:
 * true` is deliberate: constructing a `Queue` must never itself attempt a
 * socket connection — in this Docker-less sandbox (docs/DEBT.md 0-D2/0-D5)
 * that would otherwise retry against `localhost:6379` in the background for
 * the lifetime of the process. The first real command (an actual `enqueue`,
 * or a worker actually starting) is what triggers a connection attempt, and
 * `maxRetriesPerRequest: null` is BullMQ's own required setting for that
 * client (it manages retries itself).
 */
export function redisConnectionOptions(): RedisOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port.length > 0 ? Number.parseInt(url.port, 10) : 6379,
    ...(url.password.length > 0 ? { password: url.password } : {}),
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // BullMQ's `Queue` constructor touches its connection eagerly enough to
    // trigger ioredis's connect attempt regardless of `lazyConnect` (found by
    // actually booting the compiled app against no Redis in this sandbox —
    // see docs/phases/PHASE_3_REPORT.md "Bugs found"). Without a bounded
    // `retryStrategy`, ioredis's default retries forever, which would spam
    // this environment's logs indefinitely. Capping it here keeps the
    // failure honest (a handful of attempts, then it gives up and BullMQ
    // surfaces real errors on `.add()`) instead of silent infinite retry.
    retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 1000)),
  };
}

/** Real connectivity probe with a short timeout — used by `/v1/readyz`
 * (replacing the previously-hardcoded `redis: 'degraded'`, docs/DEBT.md 0-D5)
 * and safe to call even when Redis is unreachable: it always resolves within
 * `timeoutMs`, never hangs the readiness endpoint. */
export async function pingRedis(timeoutMs = 300): Promise<'ok' | 'down'> {
  const { default: IORedis } = await import('ioredis');
  const client = new IORedis({ ...redisConnectionOptions(), lazyConnect: true, connectTimeout: timeoutMs });
  try {
    const result = await Promise.race([
      client.connect().then(() => client.ping()),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs)),
    ]);
    return result === 'PONG' ? 'ok' : 'down';
  } catch {
    return 'down';
  } finally {
    client.disconnect();
  }
}
