import { Injectable } from '@nestjs/common';
import { VideoWatchRepository } from '../repositories/video-watch.repository';
import { env } from '../config/env';

/** Tolerance constants (docs/points-extension.md §8.1). Kept as named
 * constants rather than magic numbers so the fraud thresholds are legible
 * and unit-testable in isolation. */
export const HEARTBEAT_GAP_FRAUD_THRESHOLD_SECONDS = 15;
export const ACCELERATION_TOLERANCE_SECONDS = 3;
export const WATCH_SECONDS_OVERFLOW_TOLERANCE_SECONDS = 5;
export const LOW_COVERAGE_RATIO_THRESHOLD = 0.6;
export const MAX_CONCURRENT_SESSIONS = 1; // "≥ 2 concurrent sessions" flags — 1 other session is already the trigger
export const MAX_DISTINCT_DEVICES_PER_IP_PER_DAY = 3;

/** Pure gap accounting (§8.1: "server-received timestamps only", each gap
 * capped at `POINTS_HEARTBEAT_INTERVAL_SECONDS`). Returns both the RAW gap
 * (fraud signal input) and the CAPPED gap (credited seconds input). */
export function computeGapSeconds(previousReceivedAt: Date, currentReceivedAt: Date): { rawSeconds: number; cappedSeconds: number } {
  const rawSeconds = Math.max(0, (currentReceivedAt.getTime() - previousReceivedAt.getTime()) / 1000);
  const cappedSeconds = Math.min(rawSeconds, env.POINTS_HEARTBEAT_INTERVAL_SECONDS);
  return { rawSeconds, cappedSeconds };
}

/** §8.1 signal: heartbeat gap > 15s (server-side, uncapped). */
export function isHeartbeatGapFraud(rawGapSeconds: number): boolean {
  return rawGapSeconds > HEARTBEAT_GAP_FRAUD_THRESHOLD_SECONDS;
}

/** §8.1 signal: `watchPosition` moving faster than server-time accounting.
 * The client's claimed position cannot advance by more than the real
 * server-measured gap plus a small tolerance (player buffering/seek jitter). */
export function isAccelerationFraud(previousWatchPosition: number, newWatchPosition: number, rawGapSeconds: number): boolean {
  const claimedDelta = newWatchPosition - previousWatchPosition;
  return claimedDelta > rawGapSeconds + ACCELERATION_TOLERANCE_SECONDS;
}

/** §8.1 signal: `watchSeconds` > `durationSeconds` + tolerance. */
export function isWatchSecondsOverflow(watchSeconds: number, durationSeconds: number): boolean {
  return watchSeconds > durationSeconds + WATCH_SECONDS_OVERFLOW_TOLERANCE_SECONDS;
}

/** §8.1 signal: heartbeat coverage < 60% of the claimed elapsed wall time. */
export function isLowHeartbeatCoverage(heartbeatCount: number, elapsedWallSeconds: number): boolean {
  if (elapsedWallSeconds <= 0) {
    return false;
  }
  const expectedHeartbeats = elapsedWallSeconds / env.POINTS_HEARTBEAT_INTERVAL_SECONDS;
  if (expectedHeartbeats <= 0) {
    return false;
  }
  return heartbeatCount / expectedHeartbeats < LOW_COVERAGE_RATIO_THRESHOLD;
}

/**
 * Session-level fraud signals that need repository access (concurrent
 * sessions, IP/device fan-out) — everything else above is pure and unit-
 * tested directly without a DB.
 */
@Injectable()
export class FraudService {
  constructor(private readonly videoWatches: VideoWatchRepository) {}

  async detectConcurrentSessions(tenantId: string, userId: string, videoId: string, excludeWatchId: string): Promise<boolean> {
    const others = await this.videoWatches.countOtherOpenSessions(tenantId, userId, videoId, excludeWatchId);
    return others >= MAX_CONCURRENT_SESSIONS;
  }

  async detectIpDeviceFanout(tenantId: string, ipAddress: string | null, since: Date): Promise<boolean> {
    if (ipAddress === null) {
      return false;
    }
    const distinctDevices = await this.videoWatches.countDistinctDevicesForIpToday(tenantId, ipAddress, since);
    return distinctDevices > MAX_DISTINCT_DEVICES_PER_IP_PER_DAY;
  }
}
