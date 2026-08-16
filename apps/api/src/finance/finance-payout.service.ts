import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RECONCILIATION_MAJOR_VARIANCE_PCT } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OrderRepository } from '../repositories/order.repository';
import { FinancePayoutRepository, type FinancePayoutWithLines } from '../repositories/finance-payout.repository';
import { LedgerService } from '../points/ledger.service';
import { AdapterRunnerService } from '../connections/adapter-runner.service';

/**
 * Earnings ingestion + payout reconciliation engine (Phase 6, task 6.4).
 *
 * Two independent data sources feed the comparison this phase's exit
 * criterion needs ("fee decomposition matches provider statements within
 * ±0.5% on a 30-day sample"):
 *  - EXPECTED: computed purely from OmniSell's own `Order`/`OrderFee` rows
 *    for a connection/period (real Phase 5 data, always available).
 *  - ACTUAL: either (a) a connector's own `fetchEarnings` adapter method,
 *    when a connector genuinely implements it (task 6.4's "reuse Phase 3's
 *    fetchEarnings adapter method where implemented" — see this service's
 *    own doc comment on `ingestFromConnector` for exactly which connectors
 *    that is today: NONE of the ten shipped adapters set
 *    `canFetchEarnings: true`, an honest, pre-existing gap this phase did not
 *    invent), or (b) a real bank/PSP statement amount a finance admin enters
 *    manually via `reconcile()` (task 6.4's `POST /payouts/:id/reconcile`).
 */
@Injectable()
export class FinancePayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly payouts: FinancePayoutRepository,
    private readonly ledger: LedgerService,
    private readonly adapterRunner: AdapterRunnerService,
  ) {}

  /** Computes the EXPECTED net receivable for a connection/period purely
   * from Order + OrderFee data — no adapter call, always available. */
  async computeExpected(tenantId: string, connectionId: string | null, periodStart: Date, periodEnd: Date): Promise<{ expectedMinor: bigint; currency: string | null; orders: Array<{ id: string; orderNumber: string; netMinor: bigint; currency: string }> }> {
    const orders = await this.orders.listAllForExport(tenantId, { ...(connectionId !== null ? { connectionId } : {}), placedFrom: periodStart, placedTo: periodEnd }, 5000);
    let expectedMinor = 0n;
    let currency: string | null = null;
    const lines: Array<{ id: string; orderNumber: string; netMinor: bigint; currency: string }> = [];
    for (const order of orders) {
      const feesTotal = order.fees.reduce((acc, f) => acc + f.amountMinor, 0n);
      const netMinor = order.totalMinor - feesTotal;
      expectedMinor += netMinor;
      currency = currency ?? order.currency;
      lines.push({ id: order.id, orderNumber: order.orderNumber, netMinor, currency: order.currency });
    }
    return { expectedMinor, currency, orders: lines };
  }

  /** Creates (or refreshes) an `EXPECTED` `FinancePayout` batch for a
   * connection/period, ready for `reconcile()` once the real payout lands. */
  async createExpectedPayout(tenantId: string, connectionId: string | null, connectorSlug: string, periodStart: Date, periodEnd: Date): Promise<FinancePayoutWithLines> {
    const existing = await this.payouts.findOpenForPeriod(tenantId, connectionId, periodStart, periodEnd);
    const { expectedMinor, currency, orders } = await this.computeExpected(tenantId, connectionId, periodStart, periodEnd);
    if (existing !== null) {
      const updated = await this.payouts.update(tenantId, existing.id, { expectedMinor });
      return updated ?? existing;
    }
    return this.payouts.createWithLines(
      {
        tenantId,
        connectionId,
        connectorSlug,
        currency: currency ?? 'USD',
        amountMinor: 0n,
        expectedMinor,
        status: 'EXPECTED',
        varianceStatus: 'PENDING',
        periodStart,
        periodEnd,
      },
      orders.map((o) => ({ orderId: o.id, description: `Order ${o.orderNumber}`, amountMinor: o.netMinor, currency: o.currency })),
    );
  }

  /**
   * Attempts to pull a real earnings statement from the connector (task
   * 6.4's "reuse Phase 3's fetchEarnings adapter method where implemented").
   * Honest gate: as of this pass, `getAdapter(connectorSlug)?.capabilities
   * .canFetchEarnings` is `false` for all ten shipped adapters (no connector's
   * earnings/ledger endpoint was independently re-verified — see each
   * adapter's own doc comment) — this throws a clear, typed error rather than
   * fabricating a statement. The moment ANY adapter sets `canFetchEarnings:
   * true` and implements `fetchEarnings`, this path starts working with no
   * code change here.
   */
  async ingestFromConnector(tenantId: string, connectionId: string, periodStart: Date, periodEnd: Date): Promise<{ grossMinor: bigint; feesMinor: bigint; currency: string | null }> {
    const resolved = await this.adapterRunner.resolve(tenantId, connectionId);
    if (resolved.adapter.capabilities.canFetchEarnings !== true || resolved.adapter.fetchEarnings === undefined) {
      throw new ConflictException({
        message: `Connector "${resolved.connectorSlug}" does not support earnings ingestion yet (no independently-verified earnings endpoint) — enter the actual payout amount manually via reconcile() instead`,
        code: 'connector_earnings_not_supported',
      });
    }
    const rows = await this.adapterRunner.run(tenantId, connectionId, (a, ctx) => a.fetchEarnings!(ctx, { from: periodStart.toISOString(), to: periodEnd.toISOString() }));
    const grossMinor = rows.reduce((acc, r) => acc + r.grossMinor, 0n);
    const feesMinor = rows.reduce((acc, r) => acc + r.feesMinor, 0n);
    return { grossMinor, feesMinor, currency: rows[0]?.currency ?? null };
  }

  /** Records the ACTUAL amount received (from a real bank/PSP statement,
   * entered by a finance admin, or from `ingestFromConnector` when
   * available), computes the variance against the EXPECTED figure, flags it,
   * and posts the real cash-received ledger entry. */
  async reconcile(tenantId: string, payoutId: string, input: { actualAmountMinor: bigint; externalRef?: string; receivedAt: Date }, actorId: string): Promise<FinancePayoutWithLines> {
    const payout = await this.payouts.findById(tenantId, payoutId);
    if (payout === null) {
      throw new NotFoundException({ message: 'Payout not found', code: 'PAYOUT_NOT_FOUND' });
    }
    const expectedMinor = payout.expectedMinor ?? 0n;
    const varianceMinor = input.actualAmountMinor - expectedMinor;
    const variancePct = expectedMinor !== 0n ? (Number(varianceMinor < 0n ? -varianceMinor : varianceMinor) / Number(expectedMinor < 0n ? -expectedMinor : expectedMinor)) * 100 : varianceMinor === 0n ? 0 : 100;
    const varianceStatus = varianceMinor === 0n ? 'MATCHED' : variancePct <= RECONCILIATION_MAJOR_VARIANCE_PCT ? 'MINOR_VARIANCE' : 'MAJOR_VARIANCE';
    const status = varianceStatus === 'MAJOR_VARIANCE' ? 'VARIANCE_FLAGGED' : 'RECONCILED';

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.ledger.postPayoutReceived({ tenantId, payoutId, amountMinor: input.actualAmountMinor, currency: payout.currency, occurredAt: input.receivedAt }, tx);
      return tx.financePayout.update({
        where: { id: payoutId },
        data: {
          amountMinor: input.actualAmountMinor,
          varianceMinor,
          varianceStatus,
          status,
          externalRef: input.externalRef ?? payout.externalRef,
          receivedAt: input.receivedAt,
          reconciledAt: new Date(),
          reconciledById: actorId,
        },
        include: { lines: true },
      });
    });
    return updated;
  }

  async list(tenantId: string, filters: { status?: string; varianceStatus?: string }, cursor: string | undefined, limit: number) {
    return this.payouts.list(tenantId, filters, cursor, limit);
  }

  async findById(tenantId: string, id: string): Promise<FinancePayoutWithLines> {
    const payout = await this.payouts.findById(tenantId, id);
    if (payout === null) {
      throw new NotFoundException({ message: 'Payout not found', code: 'PAYOUT_NOT_FOUND' });
    }
    return payout;
  }
}
