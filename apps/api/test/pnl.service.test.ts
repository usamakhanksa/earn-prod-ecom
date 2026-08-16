import { describe, expect, it, vi } from 'vitest';
import { PnlService } from '../src/finance/pnl.service';
import type { LedgerRepository } from '../src/repositories/ledger.repository';
import type { TenantRepository } from '../src/repositories/tenant.repository';

describe('PnlService.getReport', () => {
  it('derives revenue/fees/expenses/fx/cash-flow purely from real ledger account balances', async () => {
    const netBalances: Record<string, bigint> = {
      sales_revenue: -10_000n, // credit-normal: net credit balance of 10,000 (a real gain) shows as -10,000
      shipping_revenue: -500n,
      sales_discounts: 200n, // debit-normal
      platform_commission_expense: 1_000n,
      payment_processing_expense: 300n,
      print_cost_expense: 0n,
      shipping_expense: 0n,
      tax_remittance_expense: 0n,
      other_operating_expense: 0n,
      fx_gain: -50n, // a real $50 gain
      fx_loss: 20n, // a real $20 loss
      operating_expenses: 2_000n,
    };
    const ledger = {
      sumByAccount: vi.fn().mockResolvedValue(netBalances),
      sumDirectionalByAccount: vi.fn().mockResolvedValue({ cash: { debit: 8_000n, credit: 3_000n } }),
    };
    const tenants = { findById: vi.fn().mockResolvedValue({ currency: 'USD' }) };
    const service = new PnlService(ledger as unknown as LedgerRepository, tenants as unknown as TenantRepository);

    const report = await service.getReport('t1', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(report.revenueMinor).toBe('10500'); // 10000 + 500
    expect(report.discountsMinor).toBe('200');
    expect(report.feesMinor).toBe('1300'); // 1000 + 300
    expect(report.fxGainLossMinor).toBe('30'); // 50 gain - 20 loss
    expect(report.expensesMinor).toBe('2000');
    // netProfit = 10500 - 200 - 1300 - 2000 + 30 = 7030
    expect(report.netProfitMinor).toBe('7030');
    expect(report.cashInMinor).toBe('8000');
    expect(report.cashOutMinor).toBe('3000');
    expect(report.netCashFlowMinor).toBe('5000');
    expect(report.currency).toBe('USD');
  });
});
