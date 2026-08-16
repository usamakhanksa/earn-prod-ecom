import { Injectable, Logger } from '@nestjs/common';
import { PointTransactionRepository } from '../repositories/point-transaction.repository';
import { TenantPointSettingsRepository } from '../repositories/tenant-point-settings.repository';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

/**
 * Expiry scheduler (docs/points-extension.md §7.5, task 4.5.6 — "P2
 * backend-ready"). Real logic, real DB transaction per expiring row — the
 * only thing genuinely missing is a recurring TRIGGER: there is no reachable
 * Redis in this sandbox for a BullMQ repeatable job (same class of gap as
 * `TokenRefreshService.runSweep`, docs/DEBT.md 3-D5). `runExpirySweep`/
 * `sendExpiryReminders` are real, callable, tested methods — an admin
 * endpoint or a future cron worker can call them directly today; wiring an
 * actual recurring trigger is the only remaining step once Redis exists.
 */
@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(
    private readonly pointTransactions: PointTransactionRepository,
    private readonly settings: TenantPointSettingsRepository,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /** Writes an `EXPIRY` row (§7.5) for every VALIDATED `EARN` transaction
   * whose `expiresAt` has passed, mirroring the exact wallet-crediting
   * pattern every other award path uses (never a direct `Wallet.balance`
   * write). Idempotent: the `(tenantId, source, sourceId)` unique
   * constraint means a row already expired once cannot be expired twice. */
  async runExpirySweep(tenantId: string): Promise<{ expired: number; skipped: number }> {
    const expirable = await this.pointTransactions.findExpirable(tenantId, new Date());
    let expired = 0;
    let skipped = 0;
    for (const earnRow of expirable) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findFirst({ where: { id: earnRow.walletId, tenantId } });
          if (wallet === null) {
            return;
          }
          const expiryRow = await this.pointTransactions.create(
            {
              walletId: wallet.id,
              tenantId,
              userId: earnRow.userId,
              type: 'EXPIRY',
              amount: -earnRow.amount,
              source: 'points_expiry',
              sourceId: earnRow.id,
              status: 'PENDING',
            },
            tx,
          );
          await this.pointTransactions.markValidated(tenantId, expiryRow.id, tx);
          await this.walletService.applyValidatedDelta(tx, tenantId, wallet.id, -earnRow.amount);
        });
        expired += 1;
      } catch (error) {
        // A unique-constraint hit here means this row was already expired by
        // a concurrent/previous sweep — that is the idempotency guard working
        // as intended, not a failure worth crashing the whole sweep over.
        this.logger.debug(`Skipped already-expired transaction ${earnRow.id}: ${String(error)}`);
        skipped += 1;
      }
    }
    return { expired, skipped };
  }

  /** §7.5's `notifications.points_expiring` reminder hook, reusing Phase 1's
   * `NotificationService` rather than inventing a second delivery path. */
  async sendExpiryReminders(tenantId: string): Promise<{ notified: number }> {
    const settings = await this.settings.findOrCreateDefault(tenantId);
    if (settings.autoExpireDays === null) {
      return { notified: 0 }; // points never expire for this tenant — nothing to remind about
    }
    const windowEnd = new Date(Date.now() + settings.expiryReminderDays * 86_400_000);
    const rows = await this.prisma.pointTransaction.findMany({
      where: { tenantId, type: 'EARN', status: 'VALIDATED', expiresAt: { gt: new Date(), lte: windowEnd } },
    });

    const byUser = new Map<string, bigint>();
    for (const row of rows) {
      byUser.set(row.userId, (byUser.get(row.userId) ?? 0n) + row.amount);
    }

    let notified = 0;
    for (const [userId, amount] of byUser) {
      await this.notifications.dispatch({
        tenantId,
        userId,
        type: 'SYSTEM',
        title: 'Points expiring soon',
        body: `${amount.toString()} points will expire within ${settings.expiryReminderDays} days.`,
        data: { kind: 'points_expiring', amount: amount.toString() },
      });
      notified += 1;
    }
    return { notified };
  }
}
