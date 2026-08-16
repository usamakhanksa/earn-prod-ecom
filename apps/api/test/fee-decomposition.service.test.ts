import { describe, expect, it, vi } from 'vitest';
import { FeeDecompositionService } from '../src/finance/fee-decomposition.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { OrderRepository } from '../src/repositories/order.repository';
import type { LedgerRepository } from '../src/repositories/ledger.repository';
import type { LedgerService } from '../src/points/ledger.service';

const orderRow = {
  id: 'order-1',
  orderNumber: 'A-1',
  placedAt: new Date('2026-08-01'),
  subtotalMinor: 1000n,
  discountMinor: 0n,
  taxMinor: 150n,
  shippingMinor: 50n,
  totalMinor: 1200n,
  currency: 'SAR',
  fees: [{ type: 'COMMISSION', amountMinor: 100n, currency: 'SAR' }],
};

function makeService() {
  const prisma = { $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})) };
  const orders = { findById: vi.fn().mockResolvedValue(orderRow), listAllForExport: vi.fn().mockResolvedValue([orderRow]) };
  const ledgerRepo = { findBySource: vi.fn().mockResolvedValue([]) };
  const ledger = { postOrderRevenue: vi.fn().mockResolvedValue({ id: 'entry-1' }), postOrderFees: vi.fn().mockResolvedValue({ id: 'entry-2' }) };
  const service = new FeeDecompositionService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    ledgerRepo as unknown as LedgerRepository,
    ledger as unknown as LedgerService,
  );
  return { service, orders, ledgerRepo, ledger };
}

describe('FeeDecompositionService.recognizeOrder', () => {
  it('posts both revenue and fee-decomposition entries for a not-yet-posted order', async () => {
    const { service, ledger } = makeService();
    const result = await service.recognizeOrder('t1', 'order-1');
    expect(result.posted).toBe(true);
    expect(ledger.postOrderRevenue).toHaveBeenCalled();
    expect(ledger.postOrderFees).toHaveBeenCalled();
  });

  it('is idempotent — a second call for an already-posted order is a real no-op', async () => {
    const { service, ledgerRepo, ledger } = makeService();
    ledgerRepo.findBySource.mockResolvedValue([{ id: 'existing-entry' }]);
    const result = await service.recognizeOrder('t1', 'order-1');
    expect(result.posted).toBe(false);
    expect(ledger.postOrderRevenue).not.toHaveBeenCalled();
  });

  it('throws for a missing order', async () => {
    const { service, orders } = makeService();
    orders.findById.mockResolvedValue(null);
    await expect(service.recognizeOrder('t1', 'missing')).rejects.toThrow(/not found/i);
  });
});

describe('FeeDecompositionService.recognizeUnpostedForPeriod', () => {
  it('processes every order in the period and reports a summary', async () => {
    const { service } = makeService();
    const summary = await service.recognizeUnpostedForPeriod('t1', new Date('2026-08-01'), new Date('2026-08-31'));
    expect(summary.ordersProcessed).toBe(1);
    expect(summary.ordersFailed).toHaveLength(0);
  });

  it('captures a per-order failure without aborting the whole sweep', async () => {
    const { service, ledger } = makeService();
    ledger.postOrderRevenue.mockRejectedValueOnce(new Error('boom'));
    const summary = await service.recognizeUnpostedForPeriod('t1', new Date('2026-08-01'), new Date('2026-08-31'));
    expect(summary.ordersFailed).toHaveLength(1);
    expect(summary.ordersFailed[0]?.orderId).toBe('order-1');
  });
});
