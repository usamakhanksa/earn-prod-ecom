import { describe, expect, it } from 'vitest';
import {
  assertBalancedLines,
  balanceOf,
  buildExpenseLines,
  buildFxGainLossLines,
  buildOrderFeeLines,
  buildOrderRevenueLines,
  buildPayoutReceivedLines,
  buildRefundLines,
} from '../src/ledger-postings';

describe('balanceOf / assertBalancedLines', () => {
  it('is zero for a balanced set of lines', () => {
    const lines = [
      { accountCode: 'cash', direction: 'DEBIT' as const, amountMinor: 500n, currencyCode: 'USD' },
      { accountCode: 'sales_revenue', direction: 'CREDIT' as const, amountMinor: 500n, currencyCode: 'USD' },
    ];
    expect(balanceOf(lines)).toBe(0n);
    expect(() => assertBalancedLines(lines)).not.toThrow();
  });

  it('throws on an unbalanced set', () => {
    const lines = [
      { accountCode: 'cash', direction: 'DEBIT' as const, amountMinor: 500n, currencyCode: 'USD' },
      { accountCode: 'sales_revenue', direction: 'CREDIT' as const, amountMinor: 400n, currencyCode: 'USD' },
    ];
    expect(() => assertBalancedLines(lines)).toThrow(/does not balance/);
  });

  it('throws on a negative amount', () => {
    const lines = [{ accountCode: 'cash', direction: 'DEBIT' as const, amountMinor: -1n, currencyCode: 'USD' }];
    expect(() => assertBalancedLines(lines)).toThrow(/non-negative/);
  });
});

describe('buildOrderRevenueLines', () => {
  it('debits AR for the total and credits net revenue + shipping + tax', () => {
    const lines = buildOrderRevenueLines({
      subtotalMinor: 10_000n,
      discountMinor: 1_000n,
      taxMinor: 1_350n, // 15% VAT on 9000
      shippingMinor: 500n,
      totalMinor: 10_850n, // 9000 + 1350 + 500
      currency: 'SAR',
    });
    expect(balanceOf(lines)).toBe(0n);
    const ar = lines.find((l) => l.accountCode === 'accounts_receivable');
    expect(ar?.amountMinor).toBe(10_850n);
    const revenue = lines.find((l) => l.accountCode === 'sales_revenue');
    expect(revenue?.amountMinor).toBe(9_000n);
    const tax = lines.find((l) => l.accountCode === 'tax_payable');
    expect(tax?.amountMinor).toBe(1_350n);
  });

  it('throws when the components do not reconcile to the total', () => {
    expect(() =>
      buildOrderRevenueLines({
        subtotalMinor: 10_000n,
        discountMinor: 0n,
        taxMinor: 0n,
        shippingMinor: 0n,
        totalMinor: 9_999n, // wrong on purpose
        currency: 'USD',
      }),
    ).toThrow(/does not reconcile/);
  });

  it('handles a discount larger than the subtotal without a negative revenue line', () => {
    // subtotal 100 - discount 150 = -50 net revenue, offset by 50 shipping so
    // the order total itself stays non-negative (0) — a real, if unusual,
    // heavily-discounted-bundle-plus-shipping scenario.
    const lines = buildOrderRevenueLines({
      subtotalMinor: 100n,
      discountMinor: 150n,
      taxMinor: 0n,
      shippingMinor: 50n,
      totalMinor: 0n,
      currency: 'USD',
    });
    expect(balanceOf(lines)).toBe(0n);
    expect(lines.every((l) => l.amountMinor >= 0n)).toBe(true);
    expect(lines.find((l) => l.accountCode === 'sales_discounts')?.amountMinor).toBe(50n);
  });

  it('rejects a negative order total outright', () => {
    expect(() =>
      buildOrderRevenueLines({ subtotalMinor: 100n, discountMinor: 150n, taxMinor: 0n, shippingMinor: 0n, totalMinor: -50n, currency: 'USD' }),
    ).toThrow(/non-negative/);
  });

  it('omits zero-value shipping/tax lines', () => {
    const lines = buildOrderRevenueLines({
      subtotalMinor: 1_000n,
      discountMinor: 0n,
      taxMinor: 0n,
      shippingMinor: 0n,
      totalMinor: 1_000n,
      currency: 'USD',
    });
    expect(lines.some((l) => l.accountCode === 'shipping_revenue')).toBe(false);
    expect(lines.some((l) => l.accountCode === 'tax_payable')).toBe(false);
  });
});

describe('buildOrderFeeLines', () => {
  it('decomposes fees into expense accounts against a single AR credit', () => {
    const lines = buildOrderFeeLines([
      { type: 'COMMISSION', amountMinor: 200n, currency: 'USD' },
      { type: 'PAYMENT_PROCESSING', amountMinor: 50n, currency: 'USD' },
      { type: 'PRINT_COST', amountMinor: 300n, currency: 'USD' },
    ]);
    expect(balanceOf(lines)).toBe(0n);
    expect(lines.find((l) => l.accountCode === 'platform_commission_expense')?.amountMinor).toBe(200n);
    expect(lines.find((l) => l.accountCode === 'payment_processing_expense')?.amountMinor).toBe(50n);
    expect(lines.find((l) => l.accountCode === 'print_cost_expense')?.amountMinor).toBe(300n);
    const ar = lines.find((l) => l.accountCode === 'accounts_receivable');
    expect(ar?.direction).toBe('CREDIT');
    expect(ar?.amountMinor).toBe(550n);
  });

  it('returns an empty array for no fees', () => {
    expect(buildOrderFeeLines([])).toEqual([]);
  });

  it('rejects mixed-currency fees', () => {
    expect(() =>
      buildOrderFeeLines([
        { type: 'COMMISSION', amountMinor: 100n, currency: 'USD' },
        { type: 'SHIPPING', amountMinor: 100n, currency: 'SAR' },
      ]),
    ).toThrow(/one currency/);
  });
});

describe('buildRefundLines / buildPayoutReceivedLines / buildExpenseLines / buildFxGainLossLines', () => {
  it('refund lines balance and reverse revenue/shipping/tax portions', () => {
    const lines = buildRefundLines({ revenuePortionMinor: 900n, shippingPortionMinor: 100n, taxPortionMinor: 135n, currency: 'SAR' });
    expect(balanceOf(lines)).toBe(0n);
    expect(lines.find((l) => l.accountCode === 'accounts_receivable')?.amountMinor).toBe(1_135n);
  });

  it('payout-received lines move AR into cash', () => {
    const lines = buildPayoutReceivedLines(5_000n, 'USD');
    expect(balanceOf(lines)).toBe(0n);
    expect(lines.find((l) => l.accountCode === 'cash')?.direction).toBe('DEBIT');
  });

  it('expense lines post to cash when paid immediately, else accounts payable', () => {
    const paid = buildExpenseLines(1_000n, 'USD', true);
    expect(paid.find((l) => l.accountCode === 'cash')).toBeDefined();
    const unpaid = buildExpenseLines(1_000n, 'USD', false);
    expect(unpaid.find((l) => l.accountCode === 'accounts_payable')).toBeDefined();
    expect(balanceOf(paid)).toBe(0n);
    expect(balanceOf(unpaid)).toBe(0n);
  });

  it('fx gain/loss lines pick the correct account by sign', () => {
    const gain = buildFxGainLossLines(50n, 'USD');
    expect(gain.find((l) => l.accountCode === 'fx_gain')?.direction).toBe('CREDIT');
    const loss = buildFxGainLossLines(-50n, 'USD');
    expect(loss.find((l) => l.accountCode === 'fx_loss')?.direction).toBe('DEBIT');
    expect(buildFxGainLossLines(0n, 'USD')).toEqual([]);
    expect(balanceOf(gain)).toBe(0n);
    expect(balanceOf(loss)).toBe(0n);
  });
});
