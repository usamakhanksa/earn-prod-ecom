import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DecideReturnInput, IssueRefundInput, RequestReprintInput, RequestReturnInput } from '@omnisell/shared';
import { ReturnsRefundsRepository } from '../repositories/returns-refunds.repository';
import { OrderRepository } from '../repositories/order.repository';
import { AuditLogService } from '../audit/audit-log.service';
import { OrdersService } from './orders.service';

/**
 * Returns/refunds/reprints with cost attribution (featureslist.md 6.8, task
 * 5.7). Full-refund-or-cancellation is where the points-redemption-refund
 * wiring lives — via `OrdersService.transition` (see its doc comment) —
 * this service calls that same transition rather than duplicating the
 * redemption-refund logic here, so there is exactly one place that decides
 * "an order just became CANCELLED/REFUNDED, restore any spent points".
 *
 * HONEST GAP (docs/DEBT.md): actually executing a real refund against a
 * payment processor/connector (e.g. calling Stripe or a marketplace's refund
 * API) is Phase 6 (Finance) scope — no payment-gateway integration exists in
 * this codebase yet. This service's `Refund` row is real bookkeeping (real
 * cost attribution breakdown, real idempotency, real status machine) marked
 * `COMPLETED` immediately since there is no external gateway call to await;
 * it is not simulating a delay that would exist in production.
 */
@Injectable()
export class ReturnsRefundsService {
  constructor(
    private readonly repo: ReturnsRefundsRepository,
    private readonly orders: OrderRepository,
    private readonly ordersService: OrdersService,
    private readonly audit: AuditLogService,
  ) {}

  async requestReturn(tenantId: string, actorId: string, orderId: string, input: RequestReturnInput) {
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const invalidItems = input.orderItemIds.filter((id) => !order.items.some((i) => i.id === id));
    if (invalidItems.length > 0) {
      throw new ConflictException({ message: 'Some order items do not belong to this order', code: 'ORDER_ITEM_MISMATCH' });
    }
    const ret = await this.repo.createReturn({ tenantId, orderId, status: 'REQUESTED', reason: input.reason, itemIds: input.orderItemIds, createdById: actorId });
    await this.orders.addEvent({ tenantId, orderId, type: 'RETURN_REQUESTED', message: input.reason, actorId });
    return ret;
  }

  async decideReturn(tenantId: string, actorId: string, returnId: string, input: DecideReturnInput) {
    const ret = await this.repo.findReturnById(tenantId, returnId);
    if (ret === null) {
      throw new NotFoundException({ message: 'Return not found', code: 'RETURN_NOT_FOUND' });
    }
    const updated = await this.repo.updateReturn(tenantId, returnId, { status: input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' });
    await this.orders.addEvent({ tenantId, orderId: ret.orderId, type: 'RETURN_REQUESTED', message: `Return ${input.decision.toLowerCase()}${input.note !== undefined ? `: ${input.note}` : ''}`, actorId });
    await this.audit.record({ tenantId, actorId, action: 'return.decided', entityType: 'Return', entityId: returnId, after: { status: updated?.status } });
    return updated;
  }

  async issueRefund(tenantId: string, actorId: string, orderId: string, input: IssueRefundInput, idempotencyKey: string) {
    const existing = await this.repo.findRefundByIdempotencyKey(tenantId, idempotencyKey);
    if (existing !== null) {
      return existing;
    }
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const amountMinor = BigInt(input.amountMinor);
    if (amountMinor <= 0n) {
      throw new ConflictException({ message: 'Refund amount must be positive', code: 'REFUND_AMOUNT_INVALID' });
    }
    const alreadyRefundedMinor = await this.repo.sumCompletedRefunds(tenantId, orderId);
    if (alreadyRefundedMinor + amountMinor > order.totalMinor) {
      throw new ConflictException({ message: 'Refund would exceed the order total', code: 'REFUND_EXCEEDS_TOTAL' });
    }

    const refund = await this.repo.createRefund({
      tenantId,
      orderId,
      returnId: input.returnId ?? null,
      amountMinor,
      currency: order.currency,
      reason: input.reason,
      status: 'PENDING',
      ...(input.costAttribution !== undefined ? { costAttribution: input.costAttribution as Prisma.InputJsonValue } : {}),
      idempotencyKey,
      createdById: actorId,
    });
    const completed = await this.repo.updateRefund(tenantId, refund.id, { status: 'COMPLETED', completedAt: new Date() });
    await this.orders.addEvent({ tenantId, orderId, type: 'REFUND_ISSUED', message: `Refund issued: ${input.reason}`, actorId });
    await this.audit.record({ tenantId, actorId, action: 'refund.issued', entityType: 'Refund', entityId: refund.id, after: { amountMinor: amountMinor.toString() } });

    // Full refund -> the order becomes REFUNDED, which (via OrdersService's
    // own transition logic) fires the points-redemption-refund wiring.
    const totalRefundedMinor = alreadyRefundedMinor + amountMinor;
    if (totalRefundedMinor >= order.totalMinor && order.status !== 'REFUNDED') {
      await this.ordersService.transition(tenantId, actorId, orderId, 'REFUNDED', input.reason);
    }
    return completed;
  }

  async requestReprint(tenantId: string, actorId: string, orderId: string, input: RequestReprintInput, idempotencyKey: string) {
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const reprint = await this.repo.createReprint({
      tenantId,
      orderId,
      orderItemId: input.orderItemId ?? null,
      reason: input.reason,
      status: 'REQUESTED',
      costMinor: BigInt(input.costMinor),
      currency: order.currency,
      idempotencyKey,
      createdById: actorId,
    });
    await this.orders.addEvent({ tenantId, orderId, type: 'REPRINT_REQUESTED', message: input.reason, actorId });
    return reprint;
  }

  async listForOrder(tenantId: string, orderId: string) {
    const [returns, refunds, reprints] = await Promise.all([
      this.repo.listReturnsForOrder(tenantId, orderId),
      this.repo.listRefundsForOrder(tenantId, orderId),
      this.repo.listReprintsForOrder(tenantId, orderId),
    ]);
    return { returns, refunds, reprints };
  }
}
