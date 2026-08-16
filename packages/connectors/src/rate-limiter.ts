/**
 * Per-connector rate limiter (prompt.md / implentationplanphase.md task 3.5):
 * token bucket + adaptive backoff + jitter + per-tenant fairness queue. Pure
 * logic — no I/O, no timers other than an injectable clock/scheduler — so it
 * is fully testable with vitest fake timers (see test/rate-limiter.test.ts).
 */

export interface TokenBucketConfig {
  /** Steady-state tokens refilled per second. */
  refillPerSec: number;
  /** Bucket capacity (defaults to burst if omitted). */
  capacity: number;
  /** Optional short-burst allowance above the steady-state capacity. */
  burst?: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly config: TokenBucketConfig,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = config.burst ?? config.capacity;
    this.lastRefillMs = this.now();
  }

  private refill(): void {
    const nowMs = this.now();
    const elapsedSec = Math.max(0, (nowMs - this.lastRefillMs) / 1000);
    this.lastRefillMs = nowMs;
    const cap = this.config.burst ?? this.config.capacity;
    this.tokens = Math.min(cap, this.tokens + elapsedSec * this.config.refillPerSec);
  }

  tryConsume(n = 1): boolean {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  msUntilAvailable(n = 1): number {
    this.refill();
    if (this.tokens >= n) {
      return 0;
    }
    const deficit = n - this.tokens;
    return Math.ceil((deficit / this.config.refillPerSec) * 1000);
  }

  get available(): number {
    this.refill();
    return this.tokens;
  }
}

/** Exponential backoff with symmetric jitter (prompt.md's "adaptive backoff + jitter"). */
export function computeBackoffMs(attempt: number, baseMs = 500, maxMs = 30_000, jitterRatio = 0.2): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const jitter = exp * jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

export type Scheduler = (fn: () => void, ms: number) => void;

/**
 * One rate limiter per connector slug, shared across tenants, with a
 * round-robin fairness queue so one tenant's burst cannot starve another
 * tenant's request against the same connector (prompt.md "per-tenant
 * fairness queue" / brb.md risk table's "rate-limit bans" mitigation).
 */
export class ConnectorRateLimiter {
  private readonly bucket: TokenBucket;
  private readonly queues = new Map<string, Array<() => void>>();
  private readonly tenantOrder: string[] = [];
  private draining = false;

  constructor(
    config: TokenBucketConfig,
    clock: () => number = Date.now,
    private readonly scheduleTimer: Scheduler = (fn, ms) => setTimeout(fn, ms),
  ) {
    this.bucket = new TokenBucket(config, clock);
  }

  /** Resolves once this tenant's turn arrives AND a token is available. */
  acquire(tenantId: string): Promise<void> {
    return new Promise((resolve) => {
      let queue = this.queues.get(tenantId);
      if (queue === undefined) {
        queue = [];
        this.queues.set(tenantId, queue);
      }
      if (!this.tenantOrder.includes(tenantId)) {
        this.tenantOrder.push(tenantId);
      }
      queue.push(resolve);
      this.drain();
    });
  }

  get availableTokens(): number {
    return this.bucket.available;
  }

  private drain(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;
    this.pump();
  }

  private pump(): void {
    let scanned = 0;
    while (scanned < this.tenantOrder.length) {
      const tenantId = this.tenantOrder[0];
      if (tenantId === undefined) {
        break;
      }
      const queue = this.queues.get(tenantId);
      if (queue === undefined || queue.length === 0) {
        this.rotate();
        scanned += 1;
        continue;
      }
      if (this.bucket.tryConsume(1)) {
        const resolve = queue.shift();
        this.rotate();
        resolve?.();
        scanned = 0; // more tokens may still be available — keep pumping
        continue;
      }
      const waitMs = Math.max(1, this.bucket.msUntilAvailable(1));
      this.scheduleTimer(() => this.pump(), waitMs);
      return;
    }
    this.draining = false;
  }

  private rotate(): void {
    const head = this.tenantOrder.shift();
    if (head !== undefined) {
      this.tenantOrder.push(head);
    }
  }
}

export interface WithRetryOptions {
  maxAttempts?: number;
  isRetryable?: (error: unknown) => boolean;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Retries `fn` with exponential backoff + jitter until `maxAttempts` or a
 * non-retryable error. Used by adapters together with `ConnectorError.retryable`. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: WithRetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const isRetryable = options.isRetryable ?? (() => true);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
       
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1 || !isRetryable(error)) {
        throw error;
      }
       
      await sleep(computeBackoffMs(attempt, options.baseMs, options.maxMs));
    }
  }
  throw lastError;
}
