import { Injectable } from '@nestjs/common';
import type { PnlReportView } from '@omnisell/shared';
import { LedgerRepository } from '../repositories/ledger.repository';
import { TenantRepository } from '../repositories/tenant.repository';

const REVENUE_ACCOUNTS = ['sales_revenue', 'shipping_revenue'] as const;
const DISCOUNT_ACCOUNTS = ['sales_discounts'] as const;
const FEE_EXPENSE_ACCOUNTS = [
  'platform_commission_expense',
  'payment_processing_expense',
  'print_cost_expense',
  'shipping_expense',
  'tax_remittance_expense',
  'other_operating_expense',
] as const;
const FX_ACCOUNTS = ['fx_gain', 'fx_loss'] as const;
const OPERATING_EXPENSE_ACCOUNTS = ['operating_expenses'] as const;
const CASH_ACCOUNTS = ['cash'] as const;

/**
 * P&L / cash-flow reporting by period (Phase 6, task 6.6). Reads directly
 * from the real ledger (`LedgerRepository.sumByAccount`/
 * `sumDirectionalByAccount`) — this is the read-side proof the ledger
 * actually reconciles: every number here is a sum of real, previously-posted
 * `LedgerLine` rows, never a separately-computed shadow total.
 */
@Injectable()
export class PnlService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly tenants: TenantRepository,
  ) {}

  /** Fees & Margin Breakdown (task 6.2's web surface) — real per-account fee
   * totals for a period, straight off the ledger. */
  async getFeeBreakdown(tenantId: string, from: Date, to: Date): Promise<Array<{ type: string; amountMinor: string; currency: string }>> {
    const tenant = await this.tenants.findById(tenantId);
    const currency = tenant?.currency ?? 'USD';
    const balances = await this.ledger.sumByAccount(tenantId, [...FEE_EXPENSE_ACCOUNTS], from, to);
    return FEE_EXPENSE_ACCOUNTS.map((code) => ({ type: code, amountMinor: (balances[code] ?? 0n).toString(), currency }));
  }

  async getReport(tenantId: string, from: Date, to: Date): Promise<PnlReportView> {
    const tenant = await this.tenants.findById(tenantId);
    const currency = tenant?.currency ?? 'USD';

    const netBalances = await this.ledger.sumByAccount(
      tenantId,
      [...REVENUE_ACCOUNTS, ...DISCOUNT_ACCOUNTS, ...FEE_EXPENSE_ACCOUNTS, ...FX_ACCOUNTS, ...OPERATING_EXPENSE_ACCOUNTS],
      from,
      to,
    );
    const cashDirectional = await this.ledger.sumDirectionalByAccount(tenantId, [...CASH_ACCOUNTS], from, to);

    // Revenue/liability accounts are CREDIT-normal, so their net (debit-credit)
    // balance from `sumByAccount` is <= 0 when money was actually earned —
    // negate to show a positive revenue figure.
    const revenueMinor = -sumOf(netBalances, REVENUE_ACCOUNTS);
    const discountsMinor = sumOf(netBalances, DISCOUNT_ACCOUNTS); // debit-normal, already positive
    const feesMinor = sumOf(netBalances, FEE_EXPENSE_ACCOUNTS);
    const expensesMinor = sumOf(netBalances, OPERATING_EXPENSE_ACCOUNTS);
    // fx_gain is CREDIT-normal (negative net balance = a real gain); fx_loss
    // is DEBIT-normal (positive net balance = a real loss). Net gain/loss:
    const fxGainLossMinor = -(netBalances.fx_gain ?? 0n) - (netBalances.fx_loss ?? 0n);

    const netProfitMinor = revenueMinor - discountsMinor - feesMinor - expensesMinor + fxGainLossMinor;

    const cash = cashDirectional.cash ?? { debit: 0n, credit: 0n };
    const netCashFlowMinor = cash.debit - cash.credit;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency,
      revenueMinor: revenueMinor.toString(),
      discountsMinor: discountsMinor.toString(),
      feesMinor: feesMinor.toString(),
      fxGainLossMinor: fxGainLossMinor.toString(),
      expensesMinor: expensesMinor.toString(),
      netProfitMinor: netProfitMinor.toString(),
      cashInMinor: cash.debit.toString(),
      cashOutMinor: cash.credit.toString(),
      netCashFlowMinor: netCashFlowMinor.toString(),
    };
  }
}

function sumOf(balances: Record<string, bigint>, codes: readonly string[]): bigint {
  return codes.reduce((acc, code) => acc + (balances[code] ?? 0n), 0n);
}
