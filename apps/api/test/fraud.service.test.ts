import { describe, expect, it, vi } from 'vitest';
import {
  FraudService,
  computeGapSeconds,
  isAccelerationFraud,
  isHeartbeatGapFraud,
  isLowHeartbeatCoverage,
  isWatchSecondsOverflow,
} from '../src/points/fraud.service';
import type { VideoWatchRepository } from '../src/repositories/video-watch.repository';

/**
 * Pure fraud-signal unit tests (docs/points-extension.md §8.1) — each signal
 * exercised individually, matching task 4.5.9's "all fraud signals from §8.1
 * individually" requirement.
 */
describe('fraud signal detection (pure)', () => {
  it('computeGapSeconds caps the credited gap at the heartbeat interval but reports the RAW gap uncapped', () => {
    const previous = new Date('2026-01-01T00:00:00Z');
    const current = new Date('2026-01-01T00:00:20Z'); // 20s raw gap
    const { rawSeconds, cappedSeconds } = computeGapSeconds(previous, current);
    expect(rawSeconds).toBe(20);
    expect(cappedSeconds).toBe(5); // POINTS_HEARTBEAT_INTERVAL_SECONDS default
  });

  it('flags a heartbeat gap > 15s as fraud, but not a normal ~5s gap', () => {
    expect(isHeartbeatGapFraud(16)).toBe(true);
    expect(isHeartbeatGapFraud(15)).toBe(false);
    expect(isHeartbeatGapFraud(5)).toBe(false);
  });

  it('flags watchPosition advancing faster than server time (acceleration)', () => {
    // 5s of real gap but the client claims 30s of playback progress
    expect(isAccelerationFraud(0, 30, 5)).toBe(true);
    // normal: position advances roughly with real time
    expect(isAccelerationFraud(0, 5, 5)).toBe(false);
    // within tolerance (player catch-up after a brief stall)
    expect(isAccelerationFraud(0, 7, 5)).toBe(false);
  });

  it('flags watchSeconds exceeding the video duration beyond tolerance', () => {
    expect(isWatchSecondsOverflow(120, 100)).toBe(true); // +20s over a 100s video
    expect(isWatchSecondsOverflow(103, 100)).toBe(false); // within +5s tolerance
  });

  it('flags low heartbeat coverage (< 60% of expected heartbeats for the elapsed time)', () => {
    // 100s elapsed / 5s cadence = 20 expected heartbeats; only 5 received = 25% coverage
    expect(isLowHeartbeatCoverage(5, 100)).toBe(true);
    // 18 of 20 expected = 90% coverage — healthy
    expect(isLowHeartbeatCoverage(18, 100)).toBe(false);
  });

  it('isLowHeartbeatCoverage never divides by zero for a zero-elapsed session', () => {
    expect(isLowHeartbeatCoverage(0, 0)).toBe(false);
  });
});

describe('FraudService — session-level signals (repository-backed)', () => {
  function makeService(overrides: Partial<{ countOtherOpenSessions: number; countDistinctDevicesForIpToday: number }> = {}) {
    const repo = {
      countOtherOpenSessions: vi.fn().mockResolvedValue(overrides.countOtherOpenSessions ?? 0),
      countDistinctDevicesForIpToday: vi.fn().mockResolvedValue(overrides.countDistinctDevicesForIpToday ?? 0),
    };
    return { service: new FraudService(repo as unknown as VideoWatchRepository), repo };
  }

  it('flags concurrent sessions (>= 2 total, i.e. >= 1 OTHER open session)', async () => {
    const { service } = makeService({ countOtherOpenSessions: 1 });
    await expect(service.detectConcurrentSessions('t1', 'u1', 'v1', 'watch-1')).resolves.toBe(true);
  });

  it('does not flag a solo session', async () => {
    const { service } = makeService({ countOtherOpenSessions: 0 });
    await expect(service.detectConcurrentSessions('t1', 'u1', 'v1', 'watch-1')).resolves.toBe(false);
  });

  it('flags IP/device fan-out beyond the daily distinct-device threshold', async () => {
    const { service } = makeService({ countDistinctDevicesForIpToday: 4 });
    await expect(service.detectIpDeviceFanout('t1', '1.2.3.4', new Date())).resolves.toBe(true);
  });

  it('does not flag a normal IP with a couple of devices', async () => {
    const { service } = makeService({ countDistinctDevicesForIpToday: 2 });
    await expect(service.detectIpDeviceFanout('t1', '1.2.3.4', new Date())).resolves.toBe(false);
  });

  it('never flags fan-out for a null IP (nothing to correlate)', async () => {
    const { service } = makeService();
    await expect(service.detectIpDeviceFanout('t1', null, new Date())).resolves.toBe(false);
  });
});
