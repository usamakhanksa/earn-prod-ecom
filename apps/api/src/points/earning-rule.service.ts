import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, PointEarningRule } from '@prisma/client';
import type { EarningRuleView } from '@omnisell/shared';
import { PointEarningRuleRepository, type UpsertEarningRuleInput } from '../repositories/point-earning-rule.repository';
import { PointTransactionRepository } from '../repositories/point-transaction.repository';
import { env } from '../config/env';
import { startOfTenantDay } from './tenant-day.util';

export interface ResolvedPoints {
  points: number;
  rule: PointEarningRule | null;
}

/**
 * Earning-rule engine (docs/points-extension.md §7.1/§7.3, task 4.5.3).
 *
 * Resolution order (§7.1):
 *  1. `PointEarningRule` for `(tenantId, action)` where `isActive` — missing
 *     means the action earns 0 (the caller must present it as an unavailable
 *     opportunity, never a guessed number).
 *  2. `VideoContent.pointsPerView` OVERRIDES the rule's `points` for
 *     `video_watch` when set.
 *  3. Caps + cooldown are enforced inside the SAME DB transaction as the new
 *     `PointTransaction` — `enforceCapsAndCooldown` therefore takes a
 *     `Prisma.TransactionClient`, never the plain `PrismaService`, so a
 *     caller cannot accidentally check outside the atomic boundary.
 */
@Injectable()
export class EarningRuleService {
  constructor(
    private readonly rules: PointEarningRuleRepository,
    private readonly pointTransactions: PointTransactionRepository,
  ) {}

  async resolvePoints(tenantId: string, action: string, videoPointsOverride?: number | null): Promise<ResolvedPoints> {
    const rule = await this.rules.findActiveForAction(tenantId, action);
    if (rule === null) {
      return { points: 0, rule: null };
    }
    const points = action === 'video_watch' && videoPointsOverride !== null && videoPointsOverride !== undefined ? videoPointsOverride : rule.points;
    return { points, rule };
  }

  /**
   * Throws `POINTS_COOLDOWN` (429) or `POINTS_DAILY_CAP_REACHED` (429) — both
   * carry `retryAfterSeconds` where meaningful (§9.5). Must run inside `tx`,
   * the same transaction that will insert the new `PointTransaction` row, so
   * a racing concurrent award cannot slip past the check (§7.1/§8.4).
   */
  async enforceCapsAndCooldown(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; userId: string; action: string; rule: PointEarningRule | null; pointsToAward: number; tenantTimezone: string },
  ): Promise<void> {
    const { tenantId, userId, action, rule, pointsToAward, tenantTimezone } = params;
    const todayStart = startOfTenantDay(tenantTimezone);

    if (rule?.cooldownSeconds !== null && rule?.cooldownSeconds !== undefined) {
      const last = await this.pointTransactions.findLastEarnForAction(tenantId, userId, action, tx);
      if (last !== null) {
        const elapsedSeconds = (Date.now() - last.createdAt.getTime()) / 1000;
        if (elapsedSeconds < rule.cooldownSeconds) {
          const retryAfterSeconds = Math.ceil(rule.cooldownSeconds - elapsedSeconds);
          throw new HttpException(
            { message: `Try again in ${retryAfterSeconds}s`, code: 'POINTS_COOLDOWN', retryAfterSeconds },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }

    if (rule?.maxDailyCap !== null && rule?.maxDailyCap !== undefined) {
      const earnedToday = await this.pointTransactions.sumEarnedSince(tenantId, userId, todayStart, action, tx);
      if (earnedToday + BigInt(pointsToAward) > BigInt(rule.maxDailyCap)) {
        throw new HttpException(
          { message: `Daily cap for "${action}" reached`, code: 'POINTS_DAILY_CAP_REACHED', retryAfterSeconds: secondsUntilTenantMidnight(tenantTimezone) },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const globalEarnedToday = await this.pointTransactions.sumEarnedSince(tenantId, userId, todayStart, undefined, tx);
    if (globalEarnedToday + BigInt(pointsToAward) > BigInt(env.POINTS_DAILY_EARNING_CAP)) {
      throw new HttpException(
        { message: 'Global daily earning cap reached', code: 'POINTS_DAILY_CAP_REACHED', retryAfterSeconds: secondsUntilTenantMidnight(tenantTimezone) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async listActiveForTenant(tenantId: string): Promise<EarningRuleView[]> {
    const rows = await this.rules.listActive(tenantId);
    return rows.map(toView);
  }

  async listAllForTenant(tenantId: string): Promise<EarningRuleView[]> {
    const rows = await this.rules.listAll(tenantId);
    return rows.map(toView);
  }

  async upsertRule(input: UpsertEarningRuleInput): Promise<EarningRuleView> {
    const row = await this.rules.upsert(input);
    return toView(row);
  }
}

function toView(row: PointEarningRule): EarningRuleView {
  return {
    id: row.id,
    action: row.action,
    points: row.points,
    minWatchSeconds: row.minWatchSeconds,
    maxDailyCap: row.maxDailyCap,
    cooldownSeconds: row.cooldownSeconds,
    isActive: row.isActive,
  };
}

function secondsUntilTenantMidnight(timezone: string): number {
  const start = startOfTenantDay(timezone);
  const nextMidnight = new Date(start.getTime() + 24 * 3_600_000);
  return Math.max(1, Math.ceil((nextMidnight.getTime() - Date.now()) / 1000));
}
