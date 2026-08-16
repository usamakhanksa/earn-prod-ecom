import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { VideoWatch } from '@prisma/client';
import { pointsToWire } from '@omnisell/shared';
import { VideoWatchRepository } from '../repositories/video-watch.repository';
import { VideoContentRepository } from '../repositories/video-content.repository';
import { PointTransactionRepository } from '../repositories/point-transaction.repository';
import { TenantPointSettingsRepository } from '../repositories/tenant-point-settings.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { WalletService } from './wallet.service';
import { EarningRuleService } from './earning-rule.service';
import { FraudService, computeGapSeconds, isAccelerationFraud, isHeartbeatGapFraud, isLowHeartbeatCoverage, isWatchSecondsOverflow } from './fraud.service';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';
import { PointsQueueService } from './points-queue.service';

const WATCH_FRAUD_SUSPECT = { message: 'This watch session could not be verified', code: 'WATCH_FRAUD_SUSPECT' };

/**
 * Video watch pipeline (docs/points-extension.md §7.2/§8, task 4.5.4).
 *
 * `start → heartbeat (5s cadence) → complete` is the canonical flow (§9.2).
 * Fraud checks run at two points: per-heartbeat (gap + acceleration — these
 * NEED server-received-timestamp precision, so they must happen live) and
 * at `complete()` (watch-seconds overflow, low heartbeat coverage, concurrent
 * sessions, IP/device fan-out — session-wide signals that only make sense
 * once the session is finished).
 *
 * ASYNC VALIDATION DESIGN NOTE (task 4.5.4's "BullMQ async validation worker,
 * idempotent, DLQ"): `PointsQueueService` (see that file) is a REAL BullMQ
 * queue/worker pair, same pattern as `ConnectorQueueService` (Phase 3). This
 * sandbox has no reachable Redis (docs/DEBT.md 0-D2/0-D5/3-D4), so
 * `completeWatch()` below ATTEMPTS to enqueue the validation job first; if
 * that throws (no Redis), it falls back to running the exact same
 * `awardIfEligible()` validation logic synchronously, in the same request —
 * a deliberate, documented degrade (same honesty standard as 4-D2's
 * publish-orchestrator queue-failure handling), not a silent stub. The
 * moment a real Redis exists, the enqueue path succeeds and validation moves
 * off the request path with zero code changes to this method.
 */
@Injectable()
export class VideoWatchService {
  private readonly logger = new Logger(VideoWatchService.name);

  constructor(
    private readonly videoWatches: VideoWatchRepository,
    private readonly videoContents: VideoContentRepository,
    private readonly pointTransactions: PointTransactionRepository,
    private readonly tenantPointSettings: TenantPointSettingsRepository,
    private readonly tenants: TenantRepository,
    private readonly wallets: WalletRepository,
    private readonly walletService: WalletService,
    private readonly earningRules: EarningRuleService,
    private readonly fraud: FraudService,
    private readonly prisma: PrismaService,
    private readonly queue: PointsQueueService,
  ) {}

  async start(tenantId: string, userId: string, input: { videoId: string; deviceFingerprint?: string; ipAddress?: string | null }) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todaysWatches = await this.prisma.videoWatch.count({ where: { tenantId, userId, createdAt: { gte: todayStart } } });
    if (todaysWatches >= env.POINTS_MAX_WATCHES_PER_DAY) {
      throw new HttpException(
        { message: 'Daily watch session limit reached', code: 'POINTS_MAX_WATCHES_PER_DAY', retryAfterSeconds: 3600 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const video = await this.videoContents.findById(tenantId, input.videoId);
    if (video === null || !video.isActive) {
      throw new NotFoundException({ message: 'Video not found', code: 'VIDEO_NOT_FOUND' });
    }

    const watch = await this.videoWatches.create({
      tenantId,
      userId,
      videoId: input.videoId,
      startTime: new Date(),
      deviceFingerprint: input.deviceFingerprint ?? null,
      ipAddress: input.ipAddress ?? null,
    });
    return { watchId: watch.id, heartbeatsMs: env.POINTS_HEARTBEAT_INTERVAL_SECONDS * 1000 };
  }

  async heartbeat(tenantId: string, userId: string, watchId: string, input: { timestamp: string; watchPosition: number }) {
    const watch = await this.loadOwnedOpenWatch(tenantId, userId, watchId);
    const receivedAt = new Date(); // server-received time — §4/§8.1: the client's `timestamp` is drift-logging only
    const previous = watch.lastHeartbeatAt ?? watch.startTime;
    const { rawSeconds, cappedSeconds } = computeGapSeconds(previous, receivedAt);

    if (isHeartbeatGapFraud(rawSeconds) || isAccelerationFraud(watch.lastWatchPosition ?? 0, input.watchPosition, rawSeconds)) {
      const signals = [
        ...(isHeartbeatGapFraud(rawSeconds) ? ['HEARTBEAT_GAP_EXCEEDED'] : []),
        ...(isAccelerationFraud(watch.lastWatchPosition ?? 0, input.watchPosition, rawSeconds) ? ['WATCH_POSITION_ACCELERATION'] : []),
      ];
      await this.videoWatches.markFraudSuspect(tenantId, watchId, signals);
      this.logger.warn(`Heartbeat fraud signal(s) [${signals.join(',')}] on watch ${watchId}`);
      throw new ConflictException(WATCH_FRAUD_SUSPECT);
    }

    const newWatchSeconds = watch.watchSeconds + Math.round(cappedSeconds);
    const newHeartbeatCount = watch.heartbeatCount + 1;
    const newMaxGap = Math.max(watch.maxGapSeconds ?? 0, Math.round(rawSeconds));
    await this.videoWatches.recordHeartbeat(tenantId, watchId, {
      watchSeconds: newWatchSeconds,
      heartbeatCount: newHeartbeatCount,
      maxGapSeconds: newMaxGap,
      lastHeartbeatAt: receivedAt,
      lastWatchPosition: input.watchPosition,
      status: 'WATCHING',
    });
    return { verifiedSeconds: newWatchSeconds };
  }

  async complete(tenantId: string, userId: string, watchId: string, input: { finalHeartbeat?: { timestamp: string; watchPosition: number } | undefined }) {
    const watch = await this.loadOwnedOpenWatch(tenantId, userId, watchId);

    // Fold in the final heartbeat exactly like `heartbeat()` would, so the
    // last few seconds of a watch are not lost just because the client called
    // `/complete` instead of one more `/heartbeat`.
    let latest = watch;
    if (input.finalHeartbeat !== undefined) {
      await this.heartbeat(tenantId, userId, watchId, input.finalHeartbeat); // may throw WATCH_FRAUD_SUSPECT
      const refreshed = await this.videoWatches.findById(tenantId, watchId);
      if (refreshed !== null) {
        latest = refreshed;
      }
    }

    const video = await this.videoContents.findById(tenantId, watch.videoId);
    if (video === null) {
      throw new NotFoundException({ message: 'Video not found', code: 'VIDEO_NOT_FOUND' });
    }

    const endTime = new Date();
    const elapsedWallSeconds = Math.max(0, (endTime.getTime() - latest.startTime.getTime()) / 1000);

    const sessionSignals: string[] = [];
    if (isWatchSecondsOverflow(latest.watchSeconds, video.durationSeconds)) {
      sessionSignals.push('WATCH_SECONDS_OVERFLOW');
    }
    if (isLowHeartbeatCoverage(latest.heartbeatCount, elapsedWallSeconds)) {
      sessionSignals.push('LOW_HEARTBEAT_COVERAGE');
    }
    if (await this.fraud.detectConcurrentSessions(tenantId, userId, watch.videoId, watchId)) {
      sessionSignals.push('CONCURRENT_SESSIONS');
    }
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    if (await this.fraud.detectIpDeviceFanout(tenantId, latest.ipAddress, todayStart)) {
      sessionSignals.push('IP_DEVICE_FANOUT');
    }

    if (sessionSignals.length > 0) {
      await this.videoWatches.markFraudSuspect(tenantId, watchId, sessionSignals);
      this.logger.warn(`Session fraud signal(s) [${sessionSignals.join(',')}] on watch ${watchId}`);
      throw new ConflictException(WATCH_FRAUD_SUSPECT);
    }

    await this.videoWatches.markCompleted(tenantId, watchId, endTime, latest.watchSeconds);

    // Idempotent double-award guard (§14/§16 DoD) — a retried `/complete`
    // call for the same watch must never award twice.
    const existing = await this.pointTransactions.findBySource(tenantId, 'video_watch', watchId);
    if (existing !== null) {
      return { earnedPoints: existing.status === 'REVERSED' ? null : pointsToWire(existing.amount), status: 'CREDITED' as const };
    }

    const verifiedSeconds = latest.watchSeconds;
    const gate1 = verifiedSeconds >= env.POINTS_VIDEO_MIN_WATCH_SECONDS;
    const gate2 = verifiedSeconds >= Math.ceil(video.durationSeconds * 0.6);
    if (!gate1 || !gate2) {
      return { earnedPoints: null, status: 'COMPLETED' as const };
    }

    const { points, rule } = await this.earningRules.resolvePoints(tenantId, 'video_watch', video.pointsPerView);
    if (points <= 0) {
      return { earnedPoints: null, status: 'COMPLETED' as const }; // no active rule — hidden opportunity, never a guessed number
    }

    const tenant = await this.tenants.findById(tenantId);
    const settings = await this.tenantPointSettings.findOrCreateDefault(tenantId);
    const expiresAt = settings.autoExpireDays !== null ? new Date(Date.now() + settings.autoExpireDays * 86_400_000) : null;

    // Attempt the real async path first (task 4.5.4) — degrades to inline
    // validation (see class doc comment) when Redis is unreachable.
    try {
      await this.queue.enqueueValidation({ tenantId, watchId, points, expiresAtIso: expiresAt?.toISOString() ?? null });
      return { earnedPoints: pointsToWire(BigInt(points)), status: 'COMPLETED' as const };
    } catch (error) {
      this.logger.warn(`Points award queue unreachable (validating inline instead): ${String(error)}`);
      const result = await this.awardIfEligible({
        tenantId,
        userId,
        watchId,
        action: 'video_watch',
        points,
        rule,
        tenantTimezone: tenant?.timezone ?? 'UTC',
        expiresAt,
      });
      return { earnedPoints: result === null ? null : pointsToWire(BigInt(points)), status: 'CREDITED' as const };
    }
  }

  /**
   * The actual "validation worker" logic (§7.2 step 5 / §14) — real, callable
   * both from the inline fallback above AND from `PointsQueueService`'s
   * BullMQ processor once Redis is reachable. Runs cap/cooldown enforcement,
   * the new `PointTransaction`, wallet crediting, and `VideoWatch.CREDITED`
   * transition ALL inside one DB transaction (§7.1).
   */
  async awardIfEligible(params: {
    tenantId: string;
    userId: string;
    watchId: string;
    action: string;
    points: number;
    rule: Parameters<EarningRuleService['enforceCapsAndCooldown']>[1]['rule'];
    tenantTimezone: string;
    expiresAt: Date | null;
  }) {
    const alreadyValidated = await this.pointTransactions.findValidatedBySource(params.tenantId, params.action, params.watchId);
    if (alreadyValidated !== null) {
      return alreadyValidated; // idempotent — a replayed job must never double-credit
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.findOrCreateForUser(params.tenantId, params.userId, tx);
      await this.earningRules.enforceCapsAndCooldown(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        rule: params.rule,
        pointsToAward: params.points,
        tenantTimezone: params.tenantTimezone,
      });

      const transaction = await this.pointTransactions.create(
        {
          walletId: wallet.id,
          tenantId: params.tenantId,
          userId: params.userId,
          type: 'EARN',
          amount: BigInt(params.points),
          source: params.action,
          sourceId: params.watchId,
          status: 'PENDING',
          expiresAt: params.expiresAt,
        },
        tx,
      );
      await this.pointTransactions.markValidated(params.tenantId, transaction.id, tx);
      await this.walletService.applyValidatedDelta(tx, params.tenantId, wallet.id, BigInt(params.points));
      await this.videoWatches.markCredited(params.tenantId, params.watchId, transaction.id, tx);
      return transaction;
    });
  }

  /** §17 locked default #3 — the public `/v1/wallet/earn/video-watch` alias.
   * NEVER trusts the client's own `watchSeconds`/`heartbeatLog`; it looks up
   * the real server-verified session and reruns the same `complete()` path. */
  async earnViaAlias(tenantId: string, userId: string, videoId: string) {
    const watch = await this.videoWatches.findLatestWatching(tenantId, userId, videoId);
    if (watch === null) {
      throw new ConflictException(WATCH_FRAUD_SUSPECT);
    }
    return this.complete(tenantId, userId, watch.id, {});
  }

  /** Admin fraud review queue (§8.5/§10.3). */
  async listFraudQueue(tenantId: string) {
    const rows = await this.videoWatches.listFraudSuspect(tenantId);
    const videosById = new Map((await Promise.all(rows.map((r) => this.videoContents.findById(tenantId, r.videoId)))).map((v) => [v?.id, v]));
    return rows.map((row) => ({
      watchId: row.id,
      videoId: row.videoId,
      videoTitle: videosById.get(row.videoId)?.title ?? 'Unknown video',
      userId: row.userId,
      signals: Array.isArray(row.fraudSignals) ? (row.fraudSignals as string[]) : [],
      watchSeconds: row.watchSeconds,
      heartbeatCount: row.heartbeatCount,
      maxGapSeconds: row.maxGapSeconds,
      deviceFingerprint: row.deviceFingerprint,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Approve → VALIDATED + credit (§8.5). Runs the exact same award path as
   * a clean completion — a human simply overrides the automatic fraud stop. */
  async approveFraudSuspect(tenantId: string, watchId: string, note: string, actorId: string) {
    const watch = await this.videoWatches.findById(tenantId, watchId);
    if (watch === null) {
      throw new NotFoundException({ message: 'Watch session not found', code: 'WATCH_NOT_FOUND' });
    }
    const video = await this.videoContents.findById(tenantId, watch.videoId);
    if (video === null) {
      throw new NotFoundException({ message: 'Video not found', code: 'VIDEO_NOT_FOUND' });
    }
    const { points, rule } = await this.earningRules.resolvePoints(tenantId, 'video_watch', video.pointsPerView);
    const tenant = await this.tenants.findById(tenantId);
    const settings = await this.tenantPointSettings.findOrCreateDefault(tenantId);
    const expiresAt = settings.autoExpireDays !== null ? new Date(Date.now() + settings.autoExpireDays * 86_400_000) : null;

    if (points > 0) {
      await this.awardIfEligible({
        tenantId,
        userId: watch.userId,
        watchId,
        action: 'video_watch',
        points,
        rule,
        tenantTimezone: tenant?.timezone ?? 'UTC',
        expiresAt,
      });
    }
    this.logger.log(`Fraud queue APPROVE watch=${watchId} actor=${actorId} note="${note}"`);
    return { watchId, decision: 'APPROVED' as const };
  }

  /** Reject → the watch stays `FRAUD_SUSPECT` (never self-resolves); if a
   * `PointTransaction` had already been created for it, it is `REVERSED` —
   * §3.1 forbids mutating a validated row, so a VALIDATED one is reversed
   * via status change only, never its `amount` rewritten, and the wallet
   * projection is corrected by the reversal's own negated re-application. */
  async rejectFraudSuspect(tenantId: string, watchId: string, note: string, actorId: string) {
    const watch = await this.videoWatches.findById(tenantId, watchId);
    if (watch === null) {
      throw new NotFoundException({ message: 'Watch session not found', code: 'WATCH_NOT_FOUND' });
    }
    const existing = await this.pointTransactions.findBySource(tenantId, 'video_watch', watchId);
    if (existing !== null && existing.status === 'VALIDATED') {
      await this.prisma.$transaction(async (tx) => {
        await this.pointTransactions.markReversed(tenantId, existing.id, tx);
        await this.walletService.applyValidatedDelta(tx, tenantId, existing.walletId, -existing.amount);
      });
    }
    await this.videoWatches.rejectFraudSuspect(tenantId, watchId);
    this.logger.log(`Fraud queue REJECT watch=${watchId} actor=${actorId} note="${note}"`);
    return { watchId, decision: 'REJECTED' as const };
  }

  private async loadOwnedOpenWatch(tenantId: string, userId: string, watchId: string): Promise<VideoWatch> {
    const watch = await this.videoWatches.findById(tenantId, watchId);
    if (watch === null || watch.userId !== userId) {
      throw new NotFoundException({ message: 'Watch session not found', code: 'WATCH_NOT_FOUND' });
    }
    if (watch.status !== 'STARTED' && watch.status !== 'WATCHING') {
      throw new ConflictException({ message: 'Watch session is no longer open', code: 'WATCH_CLOSED' });
    }
    return watch;
  }
}
