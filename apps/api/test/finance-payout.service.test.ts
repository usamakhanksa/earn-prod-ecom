import { describe, expect, it, vi } from 'vitest';
import { FinancePayoutService } from '../src/finance/finance-payout.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { OrderRepository } from '../src/repositories/order.repository';
import type { FinancePayoutRepository } from '../src/repositories/finance-payout.repository';
import type { LedgerService } from '../src/points/ledger.service';
import type { AdapterRunnerService } from '../src/connections/adapter-runner.service';

function makeService() {
  const prisma = {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        financePayout: {
          update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'payout-1', lines: [], ...args.data })),
        },
      }),
    ),
  };
  const orders = {
    listAllForExport: vi.fn().mockResolvedValue([
      { id: 'o1', orderNumber: 'A-1', totalMinor: 1000n, currency: 'USD', fees: [{ amountMinor: 100n }] },
      { id: 'o2', orderNumber: 'A-2', totalMinor: 2000n, currency: 'USD', fees: [{ amountMinor: 200n }] },
    ]),
  };
  const payouts = {
    findOpenForPeriod: vi.fn().mockResolvedValue(null),
    createWithLines: vi.fn().mockImplementation((payout, lines) => Promise.resolve({ ...payout, id: 'payout-1', lines })),
    findById: vi.fn(),
    update: vi.fn(),
  };
  const ledger = { postPayoutReceived: vi.fn().mockResolvedValue(undefined) };
  const adapterRunner = { run: vi.fn(), resolve: vi.fn() };
  const service = new FinancePayoutService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    payouts as unknown as FinancePayoutRepository,
    ledger as unknown as LedgerService,
    adapterRunner as unknown as AdapterRunnerService,
  );
  return { service, orders, payouts, ledger, adapterRunner };
}

describe('FinancePayoutService.computeExpected', () => {
  it('nets order totals against their fees, purely from Order/OrderFee data', async () => {
    const { service } = makeService();
    const result = await service.computeExpected('t1', 'conn-1', new Date('2026-08-01'), new Date('2026-08-31'));
    // (1000-100) + (2000-200) = 900 + 1800 = 2700
    expect(result.expectedMinor).toBe(2700n);
    expect(result.currency).toBe('USD');
  });
});

describe('FinancePayoutService.createExpectedPayout', () => {
  it('creates a FinancePayout with one line per order and the computed expected total', async () => {
    const { service, payouts } = makeService();
    await service.createExpectedPayout('t1', 'conn-1', 'etsy', new Date('2026-08-01'), new Date('2026-08-31'));
    expect(payouts.createWithLines).toHaveBeenCalledWith(
      expect.objectContaining({ expectedMinor: 2700n, status: 'EXPECTED' }),
      expect.arrayContaining([expect.objectContaining({ orderId: 'o1' }), expect.objectContaining({ orderId: 'o2' })]),
    );
  });
});

describe('FinancePayoutService.reconcile — variance flags (±0.5% exit criterion)', () => {
  it('flags MATCHED when actual equals expected exactly', async () => {
    const { service, payouts } = makeService();
    payouts.findById.mockResolvedValue({ id: 'payout-1', currency: 'USD', expectedMinor: 2700n, externalRef: null, lines: [] });
    const result = await service.reconcile('t1', 'payout-1', { actualAmountMinor: 2700n, receivedAt: new Date() }, 'user-1');
    expect(result.varianceStatus).toBe('MATCHED');
    expect(result.status).toBe('RECONCILED');
  });

  it('flags MINOR_VARIANCE when within ±0.5%', async () => {
    const { service, payouts } = makeService();
    payouts.findById.mockResolvedValue({ id: 'payout-1', currency: 'USD', expectedMinor: 100_000n, externalRef: null, lines: [] });
    // 0.3% under expected
    const result = await service.reconcile('t1', 'payout-1', { actualAmountMinor: 99_700n, receivedAt: new Date() }, 'user-1');
    expect(result.varianceStatus).toBe('MINOR_VARIANCE');
    expect(result.status).toBe('RECONCILED');
  });

  it('flags MAJOR_VARIANCE and does not auto-reconcile when variance exceeds 0.5%', async () => {
    const { service, payouts } = makeService();
    payouts.findById.mockResolvedValue({ id: 'payout-1', currency: 'USD', expectedMinor: 100_000n, externalRef: null, lines: [] });
    // 5% under expected
    const result = await service.reconcile('t1', 'payout-1', { actualAmountMinor: 95_000n, receivedAt: new Date() }, 'user-1');
    expect(result.varianceStatus).toBe('MAJOR_VARIANCE');
    expect(result.status).toBe('VARIANCE_FLAGGED');
  });

  it('posts a real cash-received ledger entry as part of reconciliation', async () => {
    const { service, payouts, ledger } = makeService();
    payouts.findById.mockResolvedValue({ id: 'payout-1', currency: 'USD', expectedMinor: 500n, externalRef: null, lines: [] });
    await service.reconcile('t1', 'payout-1', { actualAmountMinor: 500n, receivedAt: new Date() }, 'user-1');
    expect(ledger.postPayoutReceived).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', payoutId: 'payout-1', amountMinor: 500n }), expect.anything());
  });
});

describe('FinancePayoutService.ingestFromConnector — honest gate', () => {
  it('throws a typed error for a connector with no verified earnings endpoint (true for all ten shipped adapters today)', async () => {
    const { service, adapterRunner } = makeService();
    adapterRunner.resolve.mockResolvedValue({ connectorSlug: 'printful', adapter: { capabilities: { canFetchEarnings: false } } });
    await expect(service.ingestFromConnector('t1', 'conn-1', new Date(), new Date())).rejects.toThrow(/does not support earnings ingestion/);
  });
});
