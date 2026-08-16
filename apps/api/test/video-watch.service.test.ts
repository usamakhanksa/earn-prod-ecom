import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { VideoWatchService } from '../src/points/video-watch.service';
import type { VideoWatchRepository } from '../src/repositories/video-watch.repository';
import type { VideoContentRepository } from '../src/repositories/video-content.repository';
import type { PointTransactionRepository } from '../src/repositories/point-transaction.repository';
import type { TenantPointSettingsRepository } from '../src/repositories/tenant-point-settings.repository';
import type { TenantRepository } from '../src/repositories/tenant.repository';
import type { WalletRepository } from '../src/repositories/wallet.repository';
import type { WalletService } from '../src/points/wallet.service';
import type { EarningRuleService } from '../src/points/earning-rule.service';
import type { FraudService } from '../src/points/fraud.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { PointsQueueService } from '../src/points/points-queue.service';

const videoRow = { id: 'video-1', tenantId: 't1', title: 'Demo', url: 'https://x/y.mp4', durationSeconds: 100, thumbnailUrl: null, pointsPerView: null, isActive: true, createdAt: new Date() };
const rule = { id: 'rule-1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: 200, cooldownSeconds: null, isActive: true };

function makeWatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'watch-1',
    tenantId: 't1',
    userId: 'u1',
    videoId: 'video-1',
    startTime: new Date(Date.now() - 60_000),
    endTime: null,
    watchSeconds: 0,
    status: 'STARTED',
    heartbeatCount: 0,
    maxGapSeconds: null,
    transactionId: null,
    deviceFingerprint: null,
    ipAddress: '1.2.3.4',
    lastHeartbeatAt: null,
    lastWatchPosition: null,
    fraudSignals: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDeps() {
  const videoWatches = {
    findById: vi.fn(),
    create: vi.fn(),
    findLatestWatching: vi.fn(),
    countOtherOpenSessions: vi.fn().mockResolvedValue(0),
    countDistinctDevicesForIpToday: vi.fn().mockResolvedValue(0),
    recordHeartbeat: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markCredited: vi.fn().mockResolvedValue(undefined),
    markFraudSuspect: vi.fn().mockResolvedValue(undefined),
    listFraudSuspect: vi.fn().mockResolvedValue([]),
    rejectFraudSuspect: vi.fn().mockResolvedValue(undefined),
  };
  const videoContents = { findById: vi.fn().mockResolvedValue(videoRow) };
  const pointTransactions = {
    findBySource: vi.fn().mockResolvedValue(null),
    findValidatedBySource: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'ptx-1', walletId: 'w1', amount: 50n }),
    markValidated: vi.fn().mockResolvedValue(undefined),
    markReversed: vi.fn().mockResolvedValue(undefined),
  };
  const tenantPointSettings = { findOrCreateDefault: vi.fn().mockResolvedValue({ autoExpireDays: 365 }) };
  const tenants = { findById: vi.fn().mockResolvedValue({ id: 't1', timezone: 'UTC' }) };
  const wallets = { findOrCreateForUser: vi.fn().mockResolvedValue({ id: 'w1', tenantId: 't1', userId: 'u1', balance: 0n, version: 1 }) };
  const walletService = { applyValidatedDelta: vi.fn().mockResolvedValue({ balance: 50n }) };
  const earningRules = { resolvePoints: vi.fn().mockResolvedValue({ points: 50, rule }), enforceCapsAndCooldown: vi.fn().mockResolvedValue(undefined) };
  const fraud = { detectConcurrentSessions: vi.fn().mockResolvedValue(false), detectIpDeviceFanout: vi.fn().mockResolvedValue(false) };
  const prisma = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})), videoWatch: { count: vi.fn().mockResolvedValue(0) } };
  const queue = { enqueueValidation: vi.fn().mockRejectedValue(new Error('no Redis in this sandbox')) };
  return { videoWatches, videoContents, pointTransactions, tenantPointSettings, tenants, wallets, walletService, earningRules, fraud, prisma, queue };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new VideoWatchService(
    deps.videoWatches as unknown as VideoWatchRepository,
    deps.videoContents as unknown as VideoContentRepository,
    deps.pointTransactions as unknown as PointTransactionRepository,
    deps.tenantPointSettings as unknown as TenantPointSettingsRepository,
    deps.tenants as unknown as TenantRepository,
    deps.wallets as unknown as WalletRepository,
    deps.walletService as unknown as WalletService,
    deps.earningRules as unknown as EarningRuleService,
    deps.fraud as unknown as FraudService,
    deps.prisma as unknown as PrismaService,
    deps.queue as unknown as PointsQueueService,
  );
}

describe('VideoWatchService.complete — the two award gates + happy path (§7.2)', () => {
  it('awards points inline when the queue is unreachable (real fallback, not a stub) once both gates pass', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ watchSeconds: 65, heartbeatCount: 13 }); // >= 30s min AND >= 60% of 100s
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    const result = await service.complete('t1', 'u1', 'watch-1', {});

    expect(result.earnedPoints).toBe('50');
    expect(deps.pointTransactions.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'EARN', amount: 50n, source: 'video_watch', sourceId: 'watch-1' }), expect.anything());
    expect(deps.walletService.applyValidatedDelta).toHaveBeenCalledWith(expect.anything(), 't1', 'w1', 50n);
    expect(deps.videoWatches.markCredited).toHaveBeenCalledWith('t1', 'watch-1', 'ptx-1', expect.anything());
  });

  it('gate 1 fails (< min watch seconds) => no credit, no fraud, just a clean non-award', async () => {
    const deps = makeDeps();
    // heartbeatCount/startTime kept consistent with watchSeconds so this
    // fixture doesn't ALSO trip the (unrelated) low-coverage fraud signal —
    // this test is isolating gate 1, not fraud detection.
    const watch = makeWatchRow({ watchSeconds: 10, heartbeatCount: 2, startTime: new Date(Date.now() - 10_000) });
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    const result = await service.complete('t1', 'u1', 'watch-1', {});
    expect(result).toEqual({ earnedPoints: null, status: 'COMPLETED' });
    expect(deps.pointTransactions.create).not.toHaveBeenCalled();
  });

  it('gate 2 fails (>= min seconds but < 60% of duration) => no credit', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ watchSeconds: 40, heartbeatCount: 8, startTime: new Date(Date.now() - 40_000) }); // >= 30s but well below 60 (60% of 100s)
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    const result = await service.complete('t1', 'u1', 'watch-1', {});
    expect(result).toEqual({ earnedPoints: null, status: 'COMPLETED' });
  });

  it('is idempotent — a retried /complete for an already-CREDITED watch never double-awards', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ watchSeconds: 65, heartbeatCount: 13 });
    deps.videoWatches.findById.mockResolvedValue(watch);
    deps.pointTransactions.findBySource.mockResolvedValue({ id: 'ptx-existing', amount: 50n, status: 'VALIDATED' });
    const service = makeService(deps);

    const result = await service.complete('t1', 'u1', 'watch-1', {});
    expect(result).toEqual({ earnedPoints: '50', status: 'CREDITED' });
    expect(deps.pointTransactions.create).not.toHaveBeenCalled();
  });

  it('session-level fraud (watch-seconds overflow) blocks the award with WATCH_FRAUD_SUSPECT and marks the watch suspect', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ watchSeconds: 200 }); // video is only 100s long — real overflow
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    await expect(service.complete('t1', 'u1', 'watch-1', {})).rejects.toBeInstanceOf(ConflictException);
    expect(deps.videoWatches.markFraudSuspect).toHaveBeenCalledWith('t1', 'watch-1', expect.arrayContaining(['WATCH_SECONDS_OVERFLOW']));
    expect(deps.pointTransactions.create).not.toHaveBeenCalled();
  });

  it('session-level fraud (concurrent sessions) blocks the award', async () => {
    const deps = makeDeps();
    deps.fraud.detectConcurrentSessions.mockResolvedValue(true);
    const watch = makeWatchRow({ watchSeconds: 65, heartbeatCount: 13 });
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    await expect(service.complete('t1', 'u1', 'watch-1', {})).rejects.toBeInstanceOf(ConflictException);
    expect(deps.videoWatches.markFraudSuspect).toHaveBeenCalledWith('t1', 'watch-1', expect.arrayContaining(['CONCURRENT_SESSIONS']));
  });
});

describe('VideoWatchService.heartbeat — per-heartbeat fraud signals (§8.1)', () => {
  beforeEach(() => vi.useRealTimers());

  it('a heartbeat gap > 15s blocks the session and lands it in FRAUD_SUSPECT', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ status: 'WATCHING', startTime: new Date(Date.now() - 30_000), lastHeartbeatAt: new Date(Date.now() - 20_000) });
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    await expect(service.heartbeat('t1', 'u1', 'watch-1', { timestamp: new Date().toISOString(), watchPosition: 20 })).rejects.toBeInstanceOf(ConflictException);
    expect(deps.videoWatches.markFraudSuspect).toHaveBeenCalledWith('t1', 'watch-1', expect.arrayContaining(['HEARTBEAT_GAP_EXCEEDED']));
  });

  it('a normal ~5s heartbeat gap advances watchSeconds/heartbeatCount cleanly', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ status: 'WATCHING', startTime: new Date(Date.now() - 5_000), lastHeartbeatAt: new Date(Date.now() - 5_000), lastWatchPosition: 0 });
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    const result = await service.heartbeat('t1', 'u1', 'watch-1', { timestamp: new Date().toISOString(), watchPosition: 5 });
    expect(result.verifiedSeconds).toBeGreaterThan(0);
    expect(deps.videoWatches.markFraudSuspect).not.toHaveBeenCalled();
  });

  it('acceleration fraud (watchPosition advancing far faster than real time) is blocked', async () => {
    const deps = makeDeps();
    const watch = makeWatchRow({ status: 'WATCHING', startTime: new Date(Date.now() - 5_000), lastHeartbeatAt: new Date(Date.now() - 5_000), lastWatchPosition: 0 });
    deps.videoWatches.findById.mockResolvedValue(watch);
    const service = makeService(deps);

    await expect(service.heartbeat('t1', 'u1', 'watch-1', { timestamp: new Date().toISOString(), watchPosition: 60 })).rejects.toBeInstanceOf(ConflictException);
    expect(deps.videoWatches.markFraudSuspect).toHaveBeenCalledWith('t1', 'watch-1', expect.arrayContaining(['WATCH_POSITION_ACCELERATION']));
  });
});

describe('VideoWatchService fraud queue — admin review (§8.5)', () => {
  it('listFraudQueue surfaces suspect watches with their signals', async () => {
    const deps = makeDeps();
    deps.videoWatches.listFraudSuspect.mockResolvedValue([makeWatchRow({ status: 'FRAUD_SUSPECT', fraudSignals: ['HEARTBEAT_GAP_EXCEEDED'] })]);
    const service = makeService(deps);
    const queueItems = await service.listFraudQueue('t1');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]).toMatchObject({ watchId: 'watch-1', signals: ['HEARTBEAT_GAP_EXCEEDED'] });
  });

  it('reject() reverses an already-VALIDATED transaction and keeps the watch in FRAUD_SUSPECT (never self-resolves)', async () => {
    const deps = makeDeps();
    deps.videoWatches.findById.mockResolvedValue(makeWatchRow({ status: 'FRAUD_SUSPECT' }));
    deps.pointTransactions.findBySource.mockResolvedValue({ id: 'ptx-1', walletId: 'w1', amount: 50n, status: 'VALIDATED' });
    const service = makeService(deps);

    const result = await service.rejectFraudSuspect('t1', 'watch-1', 'confirmed fraud', 'admin-1');
    expect(result).toEqual({ watchId: 'watch-1', decision: 'REJECTED' });
    expect(deps.pointTransactions.markReversed).toHaveBeenCalledWith('t1', 'ptx-1', expect.anything());
    expect(deps.walletService.applyValidatedDelta).toHaveBeenCalledWith(expect.anything(), 't1', 'w1', -50n);
    expect(deps.videoWatches.rejectFraudSuspect).toHaveBeenCalledWith('t1', 'watch-1');
  });

  it('approve() credits the watch via the normal award path', async () => {
    const deps = makeDeps();
    deps.videoWatches.findById.mockResolvedValue(makeWatchRow({ status: 'FRAUD_SUSPECT' }));
    const service = makeService(deps);

    const result = await service.approveFraudSuspect('t1', 'watch-1', 'false positive', 'admin-1');
    expect(result).toEqual({ watchId: 'watch-1', decision: 'APPROVED' });
    expect(deps.walletService.applyValidatedDelta).toHaveBeenCalled();
  });
});
