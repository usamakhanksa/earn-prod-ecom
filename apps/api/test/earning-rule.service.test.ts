import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { EarningRuleService } from '../src/points/earning-rule.service';
import type { PointEarningRuleRepository } from '../src/repositories/point-earning-rule.repository';
import type { PointTransactionRepository } from '../src/repositories/point-transaction.repository';

/**
 * Earning-rule engine (docs/points-extension.md §7.1/§7.3, task 4.5.3/4.5.9):
 * resolution order, per-action cap, cooldown, and the global daily cap
 * "stacking under" per-action caps.
 */
describe('EarningRuleService.resolvePoints — resolution order (§7.1)', () => {
  it('missing rule => 0 points, never a guessed number', async () => {
    const rules = { findActiveForAction: vi.fn().mockResolvedValue(null) };
    const service = new EarningRuleService(rules as unknown as PointEarningRuleRepository, {} as unknown as PointTransactionRepository);
    const result = await service.resolvePoints('t1', 'video_watch');
    expect(result).toEqual({ points: 0, rule: null });
  });

  it("VideoContent.pointsPerView overrides the rule's own points for video_watch", async () => {
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: null, cooldownSeconds: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    const rules = { findActiveForAction: vi.fn().mockResolvedValue(rule) };
    const service = new EarningRuleService(rules as unknown as PointEarningRuleRepository, {} as unknown as PointTransactionRepository);
    const result = await service.resolvePoints('t1', 'video_watch', 75);
    expect(result.points).toBe(75);
  });

  it('falls back to the rule points when no video override is set', async () => {
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: null, cooldownSeconds: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    const rules = { findActiveForAction: vi.fn().mockResolvedValue(rule) };
    const service = new EarningRuleService(rules as unknown as PointEarningRuleRepository, {} as unknown as PointTransactionRepository);
    const result = await service.resolvePoints('t1', 'video_watch', null);
    expect(result.points).toBe(50);
  });

  it('a non-video action ignores the video override argument entirely', async () => {
    const rule = { id: 'r2', tenantId: 't1', action: 'referral_signup', points: 100, minWatchSeconds: null, maxDailyCap: null, cooldownSeconds: null, isActive: true };
    const rules = { findActiveForAction: vi.fn().mockResolvedValue(rule) };
    const service = new EarningRuleService(rules as unknown as PointEarningRuleRepository, {} as unknown as PointTransactionRepository);
    const result = await service.resolvePoints('t1', 'referral_signup', 999);
    expect(result.points).toBe(100);
  });
});

describe('EarningRuleService.enforceCapsAndCooldown — §7.3/§8.4', () => {
  function makeService(pointTransactionsOverrides: Partial<{ findLastEarnForAction: unknown; sumEarnedSince: unknown }> = {}) {
    const pointTransactions = {
      findLastEarnForAction: vi.fn().mockResolvedValue(null),
      sumEarnedSince: vi.fn().mockResolvedValue(0n),
      ...pointTransactionsOverrides,
    };
    const service = new EarningRuleService({} as unknown as PointEarningRuleRepository, pointTransactions as unknown as PointTransactionRepository);
    return { service, pointTransactions };
  }

  const fakeTx = {} as never;

  it('allows an award with no cooldown/cap configured and headroom under the global cap', async () => {
    const { service } = makeService();
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule: null, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).resolves.toBeUndefined();
  });

  it('throws POINTS_COOLDOWN (429) when the last earn for this action is inside the cooldown window', async () => {
    const { service } = makeService({ findLastEarnForAction: vi.fn().mockResolvedValue({ createdAt: new Date() }) });
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: null, cooldownSeconds: 300, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as { code: string; retryAfterSeconds: number };
      expect(response.code).toBe('POINTS_COOLDOWN');
      expect(response.retryAfterSeconds).toBeGreaterThan(0);
      return true;
    });
  });

  it('allows the award once the cooldown window has fully elapsed', async () => {
    const longAgo = new Date(Date.now() - 400_000);
    const { service } = makeService({ findLastEarnForAction: vi.fn().mockResolvedValue({ createdAt: longAgo }) });
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: null, cooldownSeconds: 300, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).resolves.toBeUndefined();
  });

  it('throws POINTS_DAILY_CAP_REACHED when the per-action daily cap would be exceeded', async () => {
    const { service } = makeService({ sumEarnedSince: vi.fn().mockResolvedValue(180n) });
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: 200, cooldownSeconds: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).rejects.toSatisfy((error: unknown) => {
      expect((error as HttpException).getResponse()).toMatchObject({ code: 'POINTS_DAILY_CAP_REACHED' });
      return true;
    });
  });

  it('allows an award that lands exactly on the per-action cap boundary', async () => {
    const { service } = makeService({ sumEarnedSince: vi.fn().mockResolvedValue(150n) });
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: 200, cooldownSeconds: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).resolves.toBeUndefined();
  });

  it('throws POINTS_DAILY_CAP_REACHED when the GLOBAL daily cap would be exceeded, even with no per-action cap', async () => {
    // sumEarnedSince is called twice: once scoped to the action (no cap => not checked, so any value),
    // once unscoped (global). Both calls resolve via the same mock; simulate the global check tripping.
    const sumEarnedSince = vi.fn().mockResolvedValue(480n); // POINTS_DAILY_EARNING_CAP default is 500
    const { service } = makeService({ sumEarnedSince });
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: null, cooldownSeconds: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).rejects.toSatisfy((error: unknown) => {
      expect((error as HttpException).getResponse()).toMatchObject({ code: 'POINTS_DAILY_CAP_REACHED' });
      return true;
    });
  });

  it('per-action cap and the global cap stack — a generous per-action cap does not bypass a tight global cap', async () => {
    const sumEarnedSince = vi.fn().mockResolvedValue(490n);
    const { service } = makeService({ sumEarnedSince });
    const rule = { id: 'r1', tenantId: 't1', action: 'video_watch', points: 50, minWatchSeconds: 30, maxDailyCap: 10_000, cooldownSeconds: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(
      service.enforceCapsAndCooldown(fakeTx, { tenantId: 't1', userId: 'u1', action: 'video_watch', rule, pointsToAward: 50, tenantTimezone: 'UTC' }),
    ).rejects.toSatisfy((error: unknown) => {
      expect((error as HttpException).getResponse()).toMatchObject({ code: 'POINTS_DAILY_CAP_REACHED' });
      return true;
    });
  });
});
