import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConnectorRateLimiter, TokenBucket, computeBackoffMs, withRetry } from '../src/rate-limiter';

describe('TokenBucket', () => {
  it('starts full and depletes one token per consume', () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSec: 1 });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills proportionally to elapsed time', () => {
    let now = 0;
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 1 }, () => now);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
    now += 500; // half a token refilled
    expect(bucket.tryConsume()).toBe(false);
    now += 600; // now ~1.1 tokens available
    expect(bucket.tryConsume()).toBe(true);
  });

  it('never refills beyond capacity/burst', () => {
    let now = 0;
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 100 }, () => now);
    now += 10_000; // would refill far past capacity without the cap
    expect(bucket.available).toBe(2);
  });

  it('reports msUntilAvailable honestly', () => {
    let now = 0;
    const bucket = new TokenBucket({ capacity: 1, refillPerSec: 2 }, () => now);
    bucket.tryConsume();
    expect(bucket.msUntilAvailable()).toBe(500); // 1 token / 2 per sec = 0.5s
  });
});

describe('computeBackoffMs', () => {
  it('grows exponentially and is capped at maxMs', () => {
    const withoutJitter = (attempt: number) => computeBackoffMs(attempt, 100, 10_000, 0);
    expect(withoutJitter(0)).toBe(100);
    expect(withoutJitter(1)).toBe(200);
    expect(withoutJitter(2)).toBe(400);
    expect(withoutJitter(10)).toBe(10_000); // capped
  });

  it('applies jitter within the configured ratio and never goes negative', () => {
    for (let i = 0; i < 50; i += 1) {
      const value = computeBackoffMs(3, 1000, 30_000, 0.5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000 * 8 * 1.5 + 1);
    }
  });
});

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { sleep: async () => {} });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable failures up to maxAttempts then throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('rate limited'));
    await expect(withRetry(fn, { maxAttempts: 3, sleep: async () => {} })).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('auth invalid'));
    await expect(
      withRetry(fn, { maxAttempts: 5, isRetryable: () => false, sleep: async () => {} }),
    ).rejects.toThrow('auth invalid');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectorRateLimiter — per-tenant fairness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('grants tokens immediately while capacity allows', async () => {
    const limiter = new ConnectorRateLimiter({ capacity: 5, refillPerSec: 1 }, Date.now, (fn, ms) => setTimeout(fn, ms));
    await limiter.acquire('tenant-a');
    await limiter.acquire('tenant-a');
    expect(limiter.availableTokens).toBeCloseTo(3, 0);
  });

  it('round-robins across tenants instead of starving one behind a burst from another', async () => {
    let now = 0;
    const scheduled: Array<() => void> = [];
    const limiter = new ConnectorRateLimiter(
      { capacity: 1, refillPerSec: 1000 }, // effectively 1 token/ms once draining
      () => now,
      (fn) => scheduled.push(fn),
    );

    const order: string[] = [];
    // Tenant A bursts 3 requests first...
    void limiter.acquire('tenant-a').then(() => order.push('a1'));
    void limiter.acquire('tenant-a').then(() => order.push('a2'));
    void limiter.acquire('tenant-a').then(() => order.push('a3'));
    // ...then tenant B arrives with a single request.
    void limiter.acquire('tenant-b').then(() => order.push('b1'));

    // Drain the scheduled timers manually, advancing the fake clock each time.
    for (let i = 0; i < 10 && order.length < 4; i += 1) {
      const next = scheduled.shift();
      now += 5;
      next?.();
      await Promise.resolve();
    }

    expect(order).toContain('a1'); // first grant always goes to whoever queued first
    expect(order.indexOf('b1')).toBeLessThan(order.indexOf('a3')); // fairness: b1 is not stuck behind ALL of a's burst
  });
});
