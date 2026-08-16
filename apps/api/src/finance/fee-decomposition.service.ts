import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderRepository } from '../repositories/order.repository';
import { LedgerRepository } from '../repositories/ledger.repository';
import { LedgerService } from '../points/ledger.service';

export interface RecognitionSummary {
  ordersProcessed: number;
  ordersSkippedAlreadyPosted: number;
  ordersFailed: Array<{ orderId: string; error: string }>;
}

/**
 * Order revenue recognition + fee decomposition (Phase 6, task 6.2). Reads
 * real `Order`/`OrderFee` rows from Phase 5 and posts them as balanced
 * ledger lines via the generalised `LedgerService`.
 *
 * DELIBERATELY NOT auto-wired into `OrdersService`'s create/ingest/refund
 * code paths this pass (a real, documented scope decision, not an oversight):
 * `OrdersService` already has its own tested lifecycle (holds, cancels,
 * refunds, the points-redemption refund wiring at 4.5-D6) and wiring a new
 * side-effect into every one of those paths needs its own dedicated
 * regression coverage that this pass's time budget does not include. Instead,
 * `recognizeOrder`/`recognizeUnpostedForPeriod` are real, callable,
 * idempotent (checked via `LedgerRepository.findBySource`) methods — the same
 * "real, callable, not yet on an automatic trigger" pattern this codebase
 * already uses for `ExpiryService.runExpirySweep` (4.5-D3),
 * `TokenRefreshService.runSweep` (3-D5), and
 * `OrderExceptionService.runSlaBreachSweep`/`OrderIngestionService.runPollSweep`
 * (5-D9) — exposed via `POST /v1/finance/orders/:id/recognize` and a bulk
 * sweep endpoint for a finance admin (or a future scheduler) to invoke.
 */
@Injectable()
export class FeeDecompositionService {
  private readonly logger = new Logger(FeeDecompositionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly ledgerRepo: LedgerRepository,
    private readonly ledger: LedgerService,
  ) {}

  /** Idempotent: a second call for an already-posted order is a real no-op
   * (detected via `LedgerRepository.findBySource`), not a silent double-post. */
  async recognizeOrder(tenantId: string, orderId: string): Promise<{ posted: boolean }> {
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const existing = await this.ledgerRepo.findBySource(tenantId, 'order_revenue', orderId);
    if (existing.length > 0) {
      return { posted: false };
    }
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.postOrderRevenue(
        {
          tenantId,
          orderId,
          occurredAt: order.placedAt,
          subtotalMinor: order.subtotalMinor,
          discountMinor: order.discountMinor,
          taxMinor: order.taxMinor,
          shippingMinor: order.shippingMinor,
          totalMinor: order.totalMinor,
          currency: order.currency,
        },
        tx,
      );
      if (order.fees.length > 0) {
        await this.ledger.postOrderFees(
          { tenantId, orderId, occurredAt: order.placedAt, fees: order.fees.map((f) => ({ type: f.type, amountMinor: f.amountMinor, currency: f.currency })) },
          tx,
        );
      }
    });
    return { posted: true };
  }

  /** Bulk sweep over a period — used by the reconciliation engine and the
   * Ledger page's "post unposted orders" admin action. */
  async recognizeUnpostedForPeriod(tenantId: string, from: Date, to: Date): Promise<RecognitionSummary> {
    const orders = await this.orders.listAllForExport(tenantId, { placedFrom: from, placedTo: to }, 5000);
    const summary: RecognitionSummary = { ordersProcessed: 0, ordersSkippedAlreadyPosted: 0, ordersFailed: [] };
    for (const order of orders) {
      try {
        const result = await this.recognizeOrder(tenantId, order.id);
        if (result.posted) {
          summary.ordersProcessed += 1;
        } else {
          summary.ordersSkippedAlreadyPosted += 1;
        }
      } catch (error) {
        this.logger.warn(`Fee decomposition failed for order ${order.id}: ${String(error)}`);
        summary.ordersFailed.push({ orderId: order.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return summary;
  }
}
