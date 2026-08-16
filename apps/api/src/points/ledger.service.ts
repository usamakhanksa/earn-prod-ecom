import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildExpenseLines,
  buildFxGainLossLines,
  buildOrderFeeLines,
  buildOrderRevenueLines,
  buildPayoutReceivedLines,
  buildRefundLines,
  balanceOf,
  type LedgerLineInput as PureLedgerLineInput,
} from '@omnisell/shared';
import { LedgerRepository, type LedgerLineInput } from '../repositories/ledger.repository';
import { PeriodLockRepository } from '../repositories/period-lock.repository';
import { PrismaService } from '../prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Double-entry ledger primitive (prompt.md "CONSUMER MODE" section /
 * points-extension.md §7.4), GENERALISED this phase (Phase 6, task 6.1) to
 * accept any tenant financial event — order revenue, fee decomposition,
 * refunds, payouts, expenses, FX gain/loss, and manual corrections — not just
 * a points-redemption discount. This is an EXTENSION of the Phase 4.5 file,
 * not a rewrite: `postBalancedEntry`, `postRedemptionDiscount`, and
 * `postRedemptionRefund` below are byte-for-byte unchanged from Phase 4.5 (see
 * docs/OPEN_QUESTIONS.md #38); everything from "Phase 6" onward is new.
 *
 * The balance assertion is enforced in TWO places by design: the pure builder
 * functions in `packages/shared/src/ledger-postings.ts` throw first (so a bad
 * posting is caught by a plain unit test with zero DB/NestJS involvement),
 * and `assertBalanced` here re-checks before any write — a caller cannot
 * bypass the check by constructing lines some other way.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly periodLocks: PeriodLockRepository,
    private readonly prisma: PrismaService,
  ) {}

  async postBalancedEntry(
    input: {
      tenantId: string;
      memo: string;
      sourceType: string;
      sourceId?: string | null;
      lines: LedgerLineInput[];
      occurredAt?: Date;
      isAdjustment?: boolean;
      reasonCode?: string | null;
      createdById?: string | null;
    },
    client: Client = this.prisma,
  ) {
    this.assertBalanced(input.lines);
    if (input.isAdjustment === true && (input.reasonCode === undefined || input.reasonCode === null || input.reasonCode.length === 0)) {
      throw new BadRequestException({ message: 'A manual ledger adjustment requires a reason code', code: 'LEDGER_REASON_CODE_REQUIRED' });
    }
    if (input.isAdjustment !== true) {
      // Period-lock enforcement (task 6.6) — once a period is LOCKED, only an
      // explicit adjustment entry may post into it. This is checked here, in
      // the one place ALL postings funnel through, not left to each caller.
      const occurredAt = input.occurredAt ?? new Date();
      const lockedPeriods = await this.periodLocks.findLockedOverlapping(input.tenantId, occurredAt, occurredAt);
      if (lockedPeriods.length > 0) {
        throw new BadRequestException({
          message: `Cannot post a normal ledger entry into a locked period (${lockedPeriods[0]?.periodStart.toISOString()} – ${lockedPeriods[0]?.periodEnd.toISOString()}). Post an adjustment entry with a reason code instead.`,
          code: 'LEDGER_PERIOD_LOCKED',
        });
      }
    }
    return this.ledger.createEntry(input, client);
  }

  private assertBalanced(lines: LedgerLineInput[]): void {
    const debits = lines.filter((l) => l.direction === 'DEBIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    const credits = lines.filter((l) => l.direction === 'CREDIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    if (debits !== credits) {
      throw new InternalServerErrorException({
        message: `Ledger entry does not balance: debits=${debits} credits=${credits}`,
        code: 'LEDGER_UNBALANCED',
      });
    }
    if (lines.some((l) => l.amountMinor < 0n)) {
      throw new InternalServerErrorException({ message: 'Ledger line amounts must be non-negative', code: 'LEDGER_UNBALANCED' });
    }
  }

  /** Redemption discount posting (§7.4.2): a contra-revenue discount debit
   * against a points-liability credit — the points the consumer "spent" were
   * always a liability the tenant owed, and redeeming them extinguishes it. */
  async postRedemptionDiscount(
    params: { tenantId: string; purchaseId: string; discountMinor: bigint; currency: string },
    client: Client,
  ) {
    if (params.discountMinor === 0n) {
      return null; // nothing to post — a zero-value redemption never happens per the floor check, but stay defensive
    }
    return this.postBalancedEntry(
      {
        tenantId: params.tenantId,
        memo: `Points redemption discount for purchase ${params.purchaseId}`,
        sourceType: 'points_redemption',
        sourceId: params.purchaseId,
        lines: [
          { accountCode: 'sales_discounts', direction: 'DEBIT', amountMinor: params.discountMinor, currencyCode: params.currency },
          { accountCode: 'points_liability', direction: 'CREDIT', amountMinor: params.discountMinor, currencyCode: params.currency },
        ],
      },
      client,
    );
  }

  /** Reversal on refund (§7.4.3) — points are restored via a new EARN row
   * elsewhere (RedemptionService); this keeps the LEDGER itself reconciled
   * too, not just the points wallet. */
  async postRedemptionRefund(
    params: { tenantId: string; purchaseId: string; discountMinor: bigint; currency: string },
    client: Client,
  ) {
    if (params.discountMinor === 0n) {
      return null;
    }
    return this.postBalancedEntry(
      {
        tenantId: params.tenantId,
        memo: `Points redemption refund reversal for purchase ${params.purchaseId}`,
        sourceType: 'points_redemption_refund',
        sourceId: params.purchaseId,
        lines: [
          { accountCode: 'points_liability', direction: 'DEBIT', amountMinor: params.discountMinor, currencyCode: params.currency },
          { accountCode: 'sales_discounts', direction: 'CREDIT', amountMinor: params.discountMinor, currencyCode: params.currency },
        ],
      },
      client,
    );
  }

  // -------------------------------------------------------------------
  // Phase 6 — Finance, Ledger & Tax generalisation (task 6.1/6.2/6.3/6.4/6.5)
  // -------------------------------------------------------------------

  /** Order revenue recognition (task 6.2). */
  async postOrderRevenue(
    params: { tenantId: string; orderId: string; occurredAt: Date; subtotalMinor: bigint; discountMinor: bigint; taxMinor: bigint; shippingMinor: bigint; totalMinor: bigint; currency: string },
    client: Client,
  ) {
    const lines = toRepoLines(buildOrderRevenueLines(params));
    if (lines.length === 0) {
      return null;
    }
    return this.postBalancedEntry(
      { tenantId: params.tenantId, memo: `Order revenue recognition for ${params.orderId}`, sourceType: 'order_revenue', sourceId: params.orderId, lines, occurredAt: params.occurredAt },
      client,
    );
  }

  /** Fee decomposition (task 6.2) — one balanced entry per order covering
   * every `OrderFee` row supplied. */
  async postOrderFees(
    params: { tenantId: string; orderId: string; occurredAt: Date; fees: Array<{ type: string; amountMinor: bigint; currency: string }> },
    client: Client,
  ) {
    const lines = toRepoLines(buildOrderFeeLines(params.fees));
    if (lines.length === 0) {
      return null;
    }
    return this.postBalancedEntry(
      { tenantId: params.tenantId, memo: `Fee decomposition for order ${params.orderId}`, sourceType: 'order_fees', sourceId: params.orderId, lines, occurredAt: params.occurredAt },
      client,
    );
  }

  /** Refund reversal (task 6.2/6.6). */
  async postOrderRefund(
    params: { tenantId: string; orderId: string; occurredAt: Date; revenuePortionMinor: bigint; shippingPortionMinor: bigint; taxPortionMinor: bigint; currency: string },
    client: Client,
  ) {
    const lines = toRepoLines(buildRefundLines(params));
    if (lines.length === 0) {
      return null;
    }
    return this.postBalancedEntry(
      { tenantId: params.tenantId, memo: `Refund for order ${params.orderId}`, sourceType: 'order_refund', sourceId: params.orderId, lines, occurredAt: params.occurredAt },
      client,
    );
  }

  /** A payout lands (task 6.4). */
  async postPayoutReceived(params: { tenantId: string; payoutId: string; amountMinor: bigint; currency: string; occurredAt: Date }, client: Client) {
    const lines = toRepoLines(buildPayoutReceivedLines(params.amountMinor, params.currency));
    if (lines.length === 0) {
      return null;
    }
    return this.postBalancedEntry(
      { tenantId: params.tenantId, memo: `Payout received (${params.payoutId})`, sourceType: 'payout', sourceId: params.payoutId, lines, occurredAt: params.occurredAt },
      client,
    );
  }

  /** An expense is recorded (task 6.5). */
  async postExpense(params: { tenantId: string; expenseId: string; amountMinor: bigint; currency: string; paidImmediately: boolean; occurredAt: Date }, client: Client) {
    const lines = toRepoLines(buildExpenseLines(params.amountMinor, params.currency, params.paidImmediately));
    if (lines.length === 0) {
      return null;
    }
    return this.postBalancedEntry(
      { tenantId: params.tenantId, memo: `Expense recorded (${params.expenseId})`, sourceType: 'expense', sourceId: params.expenseId, lines, occurredAt: params.occurredAt },
      client,
    );
  }

  /** Realised FX gain/loss recognition (task 6.3). */
  async postFxGainLoss(params: { tenantId: string; sourceId: string; gainOrLossMinor: bigint; currency: string; occurredAt: Date }, client: Client) {
    const lines = toRepoLines(buildFxGainLossLines(params.gainOrLossMinor, params.currency));
    if (lines.length === 0) {
      return null;
    }
    return this.postBalancedEntry(
      { tenantId: params.tenantId, memo: `FX gain/loss (${params.sourceId})`, sourceType: 'fx_gain_loss', sourceId: params.sourceId, lines, occurredAt: params.occurredAt },
      client,
    );
  }

  /** Manual ledger correction (task 6.11) — the ONLY posting kind the
   * period-lock check above will accept once a period is LOCKED. A reason
   * code is mandatory (double-enforced: the zod schema at the controller
   * layer and the check in `postBalancedEntry` above). */
  async postManualCorrection(
    params: { tenantId: string; memo: string; reasonCode: string; lines: LedgerLineInput[]; actorId: string; occurredAt?: Date },
    client: Client = this.prisma,
  ) {
    return this.postBalancedEntry(
      {
        tenantId: params.tenantId,
        memo: params.memo,
        sourceType: 'manual_adjustment',
        sourceId: null,
        lines: params.lines,
        ...(params.occurredAt !== undefined ? { occurredAt: params.occurredAt } : {}),
        isAdjustment: true,
        reasonCode: params.reasonCode,
        createdById: params.actorId,
      },
      client,
    );
  }
}

/** The pure builders in `@omnisell/shared` return their own
 * `LedgerLineInput` shape (structurally identical to the repository's own
 * type) — this just re-asserts the shape at the boundary rather than
 * `as`-casting, and doubles as the one place `balanceOf` gets reused to keep
 * an early, cheap sanity check before hitting the repository. */
function toRepoLines(lines: PureLedgerLineInput[]): LedgerLineInput[] {
  if (lines.length > 0 && balanceOf(lines) !== 0n) {
    throw new InternalServerErrorException({ message: 'Internal ledger posting builder produced an unbalanced result', code: 'LEDGER_UNBALANCED' });
  }
  return lines.map((l) => ({ accountCode: l.accountCode, direction: l.direction, amountMinor: l.amountMinor, currencyCode: l.currencyCode }));
}
