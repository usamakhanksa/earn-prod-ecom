import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, Wallet } from '@prisma/client';
import type { WalletTransactionsPage, WalletView } from '@omnisell/shared';
import { pointsToWire } from '@omnisell/shared';
import { WalletRepository } from '../repositories/wallet.repository';
import { PointTransactionRepository } from '../repositories/point-transaction.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { env } from '../config/env';
import { startOfTenantDay } from './tenant-day.util';

/**
 * Wallet service (docs/points-extension.md §3.5/§6.2, task 4.5.2).
 *
 * `Wallet.balance` is a CACHED PROJECTION — the only thing that may ever
 * change it is `applyValidatedDelta`, and that method NEVER trusts the
 * cached value blindly: every call re-derives the balance from scratch
 * (`Σ VALIDATED PointTransaction.amount`) and compares it to the
 * incrementally-computed new value before committing. A mismatch means some
 * OTHER code path wrote to `Wallet.balance` directly (a real bug this class
 * is designed to catch) or a stray/duplicate VALIDATED row exists — either
 * way this fails CLOSED (throws, the whole transaction rolls back) rather
 * than silently "fixing" a value that might be defending against real data
 * corruption. No other write path in this codebase touches `Wallet.balance`.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly wallets: WalletRepository,
    private readonly pointTransactions: PointTransactionRepository,
    private readonly tenants: TenantRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getOrCreateWallet(tenantId: string, userId: string): Promise<Wallet> {
    return this.wallets.findOrCreateForUser(tenantId, userId);
  }

  /**
   * The atomic credit/debit primitive every award/spend/adjust path must
   * call — and ONLY from inside an already-open `tx` that already inserted
   * (and, for EARN/SPEND/ADJUST that are meant to post now, VALIDATED) the
   * matching `PointTransaction` row. Verifies the derivation, then does the
   * CAS write. Throws (fails closed, per §3.5) on any mismatch — never
   * silently corrects `Wallet.balance`.
   */
  async applyValidatedDelta(tx: Prisma.TransactionClient, tenantId: string, walletId: string, delta: bigint): Promise<Wallet> {
    const wallet = await tx.wallet.findFirst({ where: { id: walletId, tenantId } });
    if (wallet === null) {
      throw new NotFoundException({ message: 'Wallet not found', code: 'WALLET_NOT_FOUND' });
    }
    const newBalance = wallet.balance + delta;
    const derived = await this.pointTransactions.sumValidated(tenantId, walletId, tx);
    if (derived !== newBalance) {
      // Fail-closed reconciliation alert (§3.5) — no live Sentry/pager in this
      // sandbox (docs/DEBT.md), so a loud structured error log is the honest
      // stand-in an on-call alert would consume.
      this.logger.error(
        `WALLET_RECONCILIATION_MISMATCH tenantId=${tenantId} walletId=${walletId} cachedBalance=${wallet.balance} delta=${delta} expected=${newBalance} derived=${derived}`,
      );
      throw new InternalServerErrorException({
        message: 'Wallet projection does not match its derivation — write rejected',
        code: 'POINTS_RATE_MISMATCH',
      });
    }
    return this.wallets.casUpdateBalance(tenantId, walletId, wallet.version, newBalance, tx);
  }

  /**
   * Nightly reconciliation job (§6.2's "A nightly job recomputes every
   * touched wallet; a mismatch pages on-call") — real, callable logic; no
   * cron/queue trigger exists here (no reachable Redis for a BullMQ
   * repeatable job, same class of gap as 3-D5's TokenRefreshService.runSweep,
   * which is likewise real-but-never-automatically-invoked in this sandbox).
   */
  async reconcileAllWallets(tenantId: string): Promise<{ checked: number; mismatched: string[] }> {
    const wallets = await this.prisma.wallet.findMany({ where: { tenantId } });
    const mismatched: string[] = [];
    for (const wallet of wallets) {
      const derived = await this.pointTransactions.sumValidated(tenantId, wallet.id);
      if (derived !== wallet.balance) {
        this.logger.error(`WALLET_RECONCILIATION_MISMATCH (nightly scan) tenantId=${tenantId} walletId=${wallet.id} cached=${wallet.balance} derived=${derived}`);
        mismatched.push(wallet.id);
      }
    }
    return { checked: wallets.length, mismatched };
  }

  async getWalletView(tenantId: string, userId: string): Promise<WalletView> {
    const wallet = await this.getOrCreateWallet(tenantId, userId);
    const tenant = await this.tenants.findById(tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const todayStart = startOfTenantDay(timezone);

    const [todayEarned, lifetimeEarnedRows, lifetimeSpentRows, nextExpiryRow] = await Promise.all([
      this.pointTransactions.sumEarnedSince(tenantId, userId, todayStart),
      this.prisma.pointTransaction.aggregate({
        where: { tenantId, walletId: wallet.id, type: 'EARN', status: 'VALIDATED' },
        _sum: { amount: true },
      }),
      this.prisma.pointTransaction.aggregate({
        where: { tenantId, walletId: wallet.id, type: 'SPEND', status: 'VALIDATED' },
        _sum: { amount: true },
      }),
      this.prisma.pointTransaction.findFirst({
        where: { tenantId, walletId: wallet.id, type: 'EARN', status: 'VALIDATED', expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    return {
      balance: pointsToWire(wallet.balance),
      todayEarned: pointsToWire(todayEarned),
      todayCapped: todayEarned >= BigInt(env.POINTS_DAILY_EARNING_CAP),
      lifetimeEarned: pointsToWire(lifetimeEarnedRows._sum.amount ?? 0n),
      lifetimeSpent: pointsToWire(-(lifetimeSpentRows._sum.amount ?? 0n)), // SPEND rows are stored negative
      nextExpiry:
        nextExpiryRow === null || nextExpiryRow.expiresAt === null
          ? null
          : { at: nextExpiryRow.expiresAt.toISOString(), amount: pointsToWire(nextExpiryRow.amount) },
    };
  }

  async listTransactions(
    tenantId: string,
    userId: string,
    filters: { type?: string | undefined; dateFrom?: string | undefined; dateTo?: string | undefined; cursor?: string | undefined; limit: number },
  ): Promise<WalletTransactionsPage> {
    const wallet = await this.getOrCreateWallet(tenantId, userId);
    const rows = await this.pointTransactions.listForWallet(tenantId, wallet.id, {
      ...(filters.type !== undefined ? { type: filters.type } : {}),
      ...(filters.dateFrom !== undefined ? { dateFrom: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo !== undefined ? { dateTo: new Date(filters.dateTo) } : {}),
      ...(filters.cursor !== undefined ? { cursor: filters.cursor } : {}),
      limit: filters.limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type as WalletTransactionsPage['items'][number]['type'],
        amount: pointsToWire(row.amount),
        source: row.source,
        sourceId: row.sourceId,
        status: row.status as WalletTransactionsPage['items'][number]['status'],
        validatedAt: row.validatedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length === filters.limit ? rows[rows.length - 1]?.id ?? null : null,
    };
  }

  /**
   * Manual point adjustment (§10.3's "Point adjustment tool" / §16 DoD).
   * Always a NEW `ADJUST` row — §3.1 forbids ever mutating a validated row
   * directly. `sign` decides direction (`metadata.sign`, per §6.2's balance
   * derivation rule for `ADJUST`); `reasonCode` + `note` are mandatory and
   * stored on the row for the audit trail.
   */
  async adjustPoints(params: {
    tenantId: string;
    actorId: string;
    targetUserId: string;
    amount: bigint;
    sign: 'CREDIT' | 'DEBIT';
    reasonCode: string;
    note: string;
  }): Promise<{ transactionId: string; balanceAfter: string }> {
    const signedAmount = params.sign === 'CREDIT' ? params.amount : -params.amount;
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.findOrCreateForUser(params.tenantId, params.targetUserId, tx);
      const transaction = await this.pointTransactions.create(
        {
          walletId: wallet.id,
          tenantId: params.tenantId,
          userId: params.targetUserId,
          type: 'ADJUST',
          amount: signedAmount,
          source: 'admin_adjust',
          metadata: { sign: params.sign, reasonCode: params.reasonCode, note: params.note, actorId: params.actorId },
          status: 'PENDING',
        },
        tx,
      );
      await this.pointTransactions.markValidated(params.tenantId, transaction.id, tx);
      const updatedWallet = await this.applyValidatedDelta(tx, params.tenantId, wallet.id, signedAmount);
      return { transactionId: transaction.id, balanceAfter: updatedWallet.balance };
    });

    await this.recordAudit({
      tenantId: params.tenantId,
      actorId: params.actorId,
      action: 'wallet.points_adjusted',
      entityId: result.transactionId,
      after: { targetUserId: params.targetUserId, amount: signedAmount.toString(), reasonCode: params.reasonCode, note: params.note },
    });
    return { transactionId: result.transactionId, balanceAfter: pointsToWire(result.balanceAfter) };
  }

  /** Audit hook for every wallet mutation (§16 DoD: "Audit event ... on
   * every mutation"). Called AFTER the transaction commits — an audit
   * record for a write that got rolled back would be worse than none. */
  async recordAudit(params: { tenantId: string; actorId: string; action: string; entityId: string; after: unknown }): Promise<void> {
    await this.audit.record({
      tenantId: params.tenantId,
      actorId: params.actorId,
      action: params.action,
      entityType: 'Wallet',
      entityId: params.entityId,
      after: params.after,
    });
  }
}
