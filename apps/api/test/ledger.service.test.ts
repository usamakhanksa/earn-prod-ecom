import { describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../src/points/ledger.service';
import type { LedgerRepository } from '../src/repositories/ledger.repository';
import type { PeriodLockRepository } from '../src/repositories/period-lock.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeService(overrides?: { lockedPeriods?: unknown[] }) {
  const ledgerRepo = { createEntry: vi.fn().mockImplementation((input) => Promise.resolve({ id: 'entry-1', ...input })) };
  const periodLocks = { findLockedOverlapping: vi.fn().mockResolvedValue(overrides?.lockedPeriods ?? []) };
  const prisma = {};
  const service = new LedgerService(ledgerRepo as unknown as LedgerRepository, periodLocks as unknown as PeriodLockRepository, prisma as unknown as PrismaService);
  return { service, ledgerRepo, periodLocks };
}

const client = {} as never;

describe('LedgerService.postBalancedEntry — generalised balance assertion (task 6.1)', () => {
  it('accepts a balanced set of lines', async () => {
    const { service } = makeService();
    await expect(
      service.postBalancedEntry(
        { tenantId: 't1', memo: 'test', sourceType: 'order_revenue', lines: [
          { accountCode: 'accounts_receivable', direction: 'DEBIT', amountMinor: 100n, currencyCode: 'USD' },
          { accountCode: 'sales_revenue', direction: 'CREDIT', amountMinor: 100n, currencyCode: 'USD' },
        ] },
        client,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an unbalanced set of lines', async () => {
    const { service } = makeService();
    await expect(
      service.postBalancedEntry(
        { tenantId: 't1', memo: 'bad', sourceType: 'order_revenue', lines: [
          { accountCode: 'accounts_receivable', direction: 'DEBIT', amountMinor: 100n, currencyCode: 'USD' },
          { accountCode: 'sales_revenue', direction: 'CREDIT', amountMinor: 90n, currencyCode: 'USD' },
        ] },
        client,
      ),
    ).rejects.toThrow(/does not balance/);
  });

  it('rejects a normal (non-adjustment) posting into a locked period', async () => {
    const { service } = makeService({ lockedPeriods: [{ periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31') }] });
    await expect(
      service.postBalancedEntry(
        { tenantId: 't1', memo: 'late post', sourceType: 'order_revenue', occurredAt: new Date('2026-01-15'), lines: [
          { accountCode: 'cash', direction: 'DEBIT', amountMinor: 100n, currencyCode: 'USD' },
          { accountCode: 'sales_revenue', direction: 'CREDIT', amountMinor: 100n, currencyCode: 'USD' },
        ] },
        client,
      ),
    ).rejects.toThrow(/locked period/);
  });

  it('allows an adjustment posting (with a reason code) into a locked period', async () => {
    const { service, ledgerRepo } = makeService({ lockedPeriods: [{ periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31') }] });
    await service.postManualCorrection(
      {
        tenantId: 't1',
        memo: 'correction',
        reasonCode: 'RECONCILIATION_ADJUSTMENT',
        actorId: 'user-1',
        occurredAt: new Date('2026-01-15'),
        lines: [
          { accountCode: 'cash', direction: 'DEBIT', amountMinor: 50n, currencyCode: 'USD' },
          { accountCode: 'sales_revenue', direction: 'CREDIT', amountMinor: 50n, currencyCode: 'USD' },
        ],
      },
      client,
    );
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ isAdjustment: true, reasonCode: 'RECONCILIATION_ADJUSTMENT', createdById: 'user-1' }),
      client,
    );
  });

  it('rejects a manual correction with no reason code', async () => {
    const { service } = makeService();
    await expect(
      service.postBalancedEntry(
        { tenantId: 't1', memo: 'bad correction', sourceType: 'manual_adjustment', isAdjustment: true, lines: [
          { accountCode: 'cash', direction: 'DEBIT', amountMinor: 10n, currencyCode: 'USD' },
          { accountCode: 'sales_revenue', direction: 'CREDIT', amountMinor: 10n, currencyCode: 'USD' },
        ] },
        client,
      ),
    ).rejects.toThrow(/reason code/);
  });
});

describe('LedgerService — generalised posting helpers (task 6.1/6.2/6.3/6.4/6.5)', () => {
  it('postOrderRevenue posts a balanced order-revenue entry', async () => {
    const { service, ledgerRepo } = makeService();
    await service.postOrderRevenue(
      { tenantId: 't1', orderId: 'order-1', occurredAt: new Date(), subtotalMinor: 1000n, discountMinor: 0n, taxMinor: 150n, shippingMinor: 50n, totalMinor: 1200n, currency: 'SAR' },
      client,
    );
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'order_revenue', sourceId: 'order-1' }), client);
  });

  it('postOrderFees posts a balanced fee-decomposition entry', async () => {
    const { service, ledgerRepo } = makeService();
    await service.postOrderFees(
      { tenantId: 't1', orderId: 'order-1', occurredAt: new Date(), fees: [{ type: 'COMMISSION', amountMinor: 100n, currency: 'USD' }] },
      client,
    );
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'order_fees' }), client);
  });

  it('postOrderFees is a no-op for an order with no fees', async () => {
    const { service, ledgerRepo } = makeService();
    const result = await service.postOrderFees({ tenantId: 't1', orderId: 'order-1', occurredAt: new Date(), fees: [] }, client);
    expect(result).toBeNull();
    expect(ledgerRepo.createEntry).not.toHaveBeenCalled();
  });

  it('postPayoutReceived posts cash-in against accounts receivable', async () => {
    const { service, ledgerRepo } = makeService();
    await service.postPayoutReceived({ tenantId: 't1', payoutId: 'payout-1', amountMinor: 500n, currency: 'USD', occurredAt: new Date() }, client);
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'payout', sourceId: 'payout-1' }), client);
  });

  it('postExpense posts to accounts_payable when not paid immediately', async () => {
    const { service, ledgerRepo } = makeService();
    await service.postExpense({ tenantId: 't1', expenseId: 'exp-1', amountMinor: 200n, currency: 'USD', paidImmediately: false, occurredAt: new Date() }, client);
    const call = ledgerRepo.createEntry.mock.calls[0]![0];
    expect(call.lines.some((l: { accountCode: string }) => l.accountCode === 'accounts_payable')).toBe(true);
  });
});
