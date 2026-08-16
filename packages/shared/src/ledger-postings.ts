import { ORDER_FEE_TYPE_TO_LEDGER_ACCOUNT, type LedgerAccountCode, type LedgerDirection, type OrderFeeType } from './enums';

/**
 * Pure double-entry posting builders (Phase 6 — Finance, Ledger & Tax,
 * implentationplanphase.md tasks 6.1/6.2). These are the "generalize the
 * ledger to accept any tenant financial event" half of task 6.1: given plain
 * order/fee/refund/payout/expense data, each function returns a balanced set
 * of `LedgerLineInput`-shaped lines with NO database access, so they are
 * unit-testable in complete isolation from Prisma/NestJS (see
 * `packages/shared/test/ledger-postings.test.ts`).
 *
 * `apps/api/src/points/ledger.service.ts` (the real, minimal Phase 4.5
 * primitive this phase extends per docs/OPEN_QUESTIONS.md #38) calls these
 * builders and then posts the result through its own DB-aware
 * `postBalancedEntry`, which re-asserts the DEBIT=CREDIT invariant at write
 * time — the balance check exists in TWO places on purpose: here (so a bad
 * posting is caught by a pure unit test before touching a DB) and in the
 * service (so a caller can never bypass the check by constructing lines
 * some other way).
 *
 * A money amount is only ever a non-negative `bigint`; `direction` carries
 * the sign, exactly like the Phase 4.5 primitive already established.
 */

export interface LedgerLineInput {
  accountCode: LedgerAccountCode | string;
  direction: LedgerDirection;
  amountMinor: bigint;
  currencyCode: string;
}

function line(accountCode: LedgerAccountCode | string, direction: LedgerDirection, amountMinor: bigint, currencyCode: string): LedgerLineInput {
  return { accountCode, direction, amountMinor, currencyCode };
}

/** Sum of DEBIT lines minus sum of CREDIT lines — 0n means balanced. Exported
 * so both the pure unit tests here and the DB-aware service can share one
 * definition of "balanced". */
export function balanceOf(lines: LedgerLineInput[]): bigint {
  return lines.reduce((acc, l) => (l.direction === 'DEBIT' ? acc + l.amountMinor : acc - l.amountMinor), 0n);
}

export function assertBalancedLines(lines: LedgerLineInput[]): void {
  if (lines.some((l) => l.amountMinor < 0n)) {
    throw new Error('Ledger line amounts must be non-negative');
  }
  const balance = balanceOf(lines);
  if (balance !== 0n) {
    throw new Error(`Ledger posting does not balance: debits-credits=${balance}`);
  }
}

/**
 * Order revenue recognition (task 6.2). Debits Accounts Receivable for the
 * order total; credits net sales revenue (subtotal minus any order-level
 * discount), shipping revenue, and tax payable. Requires the caller's own
 * arithmetic to already satisfy
 * `totalMinor === subtotalMinor - discountMinor + taxMinor + shippingMinor`
 * (the same relationship `Order` rows are created under in Phase 5) — this
 * function does not silently force balance by fudging one side; it throws if
 * the inputs don't already reconcile, which is the honest failure mode for a
 * corrupt/miscomputed Order row.
 */
export function buildOrderRevenueLines(input: {
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  shippingMinor: bigint;
  totalMinor: bigint;
  currency: string;
}): LedgerLineInput[] {
  if (input.totalMinor < 0n) {
    throw new Error(`Order totalMinor must be non-negative for revenue recognition; received ${input.totalMinor}`);
  }
  const netRevenue = input.subtotalMinor - input.discountMinor;
  const expectedTotal = netRevenue + input.taxMinor + input.shippingMinor;
  if (expectedTotal !== input.totalMinor) {
    throw new Error(
      `Order total does not reconcile with its components: subtotal-discount+tax+shipping=${expectedTotal} vs totalMinor=${input.totalMinor}`,
    );
  }
  // AR always debits exactly totalMinor, regardless of netRevenue's sign —
  // when a discount exceeds the subtotal (netRevenue < 0), the missing
  // credit-side value is supplied by a `sales_discounts` DEBIT instead of a
  // (disallowed, negative) `sales_revenue` credit; the two sides still
  // balance because totalMinor already nets everything out algebraically.
  const lines: LedgerLineInput[] = [line('accounts_receivable', 'DEBIT', input.totalMinor, input.currency)];
  if (netRevenue > 0n) {
    lines.push(line('sales_revenue', 'CREDIT', netRevenue, input.currency));
  } else if (netRevenue < 0n) {
    lines.push(line('sales_discounts', 'DEBIT', -netRevenue, input.currency));
  }
  if (input.shippingMinor > 0n) {
    lines.push(line('shipping_revenue', 'CREDIT', input.shippingMinor, input.currency));
  }
  if (input.taxMinor > 0n) {
    lines.push(line('tax_payable', 'CREDIT', input.taxMinor, input.currency));
  }
  assertBalancedLines(lines);
  return lines;
}

/**
 * Fee decomposition (task 6.2): each `OrderFee` row becomes a debit to its
 * mapped expense account, funded by a credit to Accounts Receivable (a fee
 * netted out of what the channel will actually pay out reduces the AR
 * balance for that order/connection, which is exactly what the Phase 6.4
 * reconciliation engine compares against the real payout later).
 */
export function buildOrderFeeLines(fees: Array<{ type: OrderFeeType | string; amountMinor: bigint; currency: string }>): LedgerLineInput[] {
  const nonZero = fees.filter((f) => f.amountMinor > 0n);
  if (nonZero.length === 0) {
    return [];
  }
  const currency = nonZero[0]!.currency;
  const lines: LedgerLineInput[] = [];
  let total = 0n;
  for (const fee of nonZero) {
    if (fee.currency !== currency) {
      throw new Error('buildOrderFeeLines requires all fees to share one currency; convert via FX before posting');
    }
    const account = ORDER_FEE_TYPE_TO_LEDGER_ACCOUNT[fee.type as OrderFeeType] ?? 'other_operating_expense';
    lines.push(line(account, 'DEBIT', fee.amountMinor, currency));
    total += fee.amountMinor;
  }
  lines.push(line('accounts_receivable', 'CREDIT', total, currency));
  assertBalancedLines(lines);
  return lines;
}

/**
 * Refund reversal (task 6.2/6.6). Reverses a proportional slice of revenue,
 * shipping revenue, and tax payable back out of Accounts Receivable. Caller
 * supplies the exact portions (from `ReturnsRefundsService`'s own cost
 * attribution, Phase 5) rather than this function guessing a proportion.
 */
export function buildRefundLines(input: { revenuePortionMinor: bigint; shippingPortionMinor: bigint; taxPortionMinor: bigint; currency: string }): LedgerLineInput[] {
  const total = input.revenuePortionMinor + input.shippingPortionMinor + input.taxPortionMinor;
  if (total <= 0n) {
    return [];
  }
  const lines: LedgerLineInput[] = [];
  if (input.revenuePortionMinor > 0n) {
    lines.push(line('sales_revenue', 'DEBIT', input.revenuePortionMinor, input.currency));
  }
  if (input.shippingPortionMinor > 0n) {
    lines.push(line('shipping_revenue', 'DEBIT', input.shippingPortionMinor, input.currency));
  }
  if (input.taxPortionMinor > 0n) {
    lines.push(line('tax_payable', 'DEBIT', input.taxPortionMinor, input.currency));
  }
  lines.push(line('accounts_receivable', 'CREDIT', total, input.currency));
  assertBalancedLines(lines);
  return lines;
}

/** A payout lands: cash increases, the receivable it settles is cleared
 * (task 6.4). */
export function buildPayoutReceivedLines(amountMinor: bigint, currency: string): LedgerLineInput[] {
  if (amountMinor <= 0n) {
    return [];
  }
  const lines = [line('cash', 'DEBIT', amountMinor, currency), line('accounts_receivable', 'CREDIT', amountMinor, currency)];
  assertBalancedLines(lines);
  return lines;
}

/** An expense is recorded (task 6.5). `paidImmediately` posts straight
 * against cash; otherwise it books a payable, settled by a later cash
 * posting (out of scope for this phase — no bill-pay integration exists). */
export function buildExpenseLines(amountMinor: bigint, currency: string, paidImmediately: boolean): LedgerLineInput[] {
  if (amountMinor <= 0n) {
    return [];
  }
  const lines = [
    line('operating_expenses', 'DEBIT', amountMinor, currency),
    line(paidImmediately ? 'cash' : 'accounts_payable', 'CREDIT', amountMinor, currency),
  ];
  assertBalancedLines(lines);
  return lines;
}

/** Realised FX gain/loss recognition (task 6.3) as a ledger posting — the
 * pure gain/loss NUMBER comes from `fx-math.ts`; this just turns a signed
 * gain/loss amount into a balanced pair against cash/AR. */
export function buildFxGainLossLines(gainOrLossMinor: bigint, currency: string, against: 'cash' | 'accounts_receivable' = 'cash'): LedgerLineInput[] {
  if (gainOrLossMinor === 0n) {
    return [];
  }
  const isGain = gainOrLossMinor > 0n;
  const amount = isGain ? gainOrLossMinor : -gainOrLossMinor;
  const lines = isGain
    ? [line(against, 'DEBIT', amount, currency), line('fx_gain', 'CREDIT', amount, currency)]
    : [line('fx_loss', 'DEBIT', amount, currency), line(against, 'CREDIT', amount, currency)];
  assertBalancedLines(lines);
  return lines;
}
