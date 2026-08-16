import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ListExceptionsQuery, OrderExceptionType } from '@omnisell/shared';
import { OrderExceptionRepository } from '../repositories/order-exception.repository';
import { OrderRepository } from '../repositories/order.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { NotificationService } from '../notifications/notification.service';
import { computeSlaDueAt } from './sla.util';
import { assertTransition, canTransition } from './order-status.machine';

/**
 * Exception queue + SLA timers/breach alerts (featureslist.md 6.7/6.11, task
 * 5.6). Breach alerts reuse Phase 1's `NotificationService` — no new
 * notification transport invented.
 */
@Injectable()
export class OrderExceptionService {
  private readonly logger = new Logger(OrderExceptionService.name);

  constructor(
    private readonly exceptions: OrderExceptionRepository,
    private readonly orders: OrderRepository,
    private readonly memberships: MembershipRepository,
    private readonly notifications: NotificationService,
  ) {}

  async open(tenantId: string, orderId: string, type: OrderExceptionType, message: string, actorId?: string) {
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const exception = await this.exceptions.create({
      tenantId,
      orderId,
      type,
      status: 'OPEN',
      message,
      slaDueAt: computeSlaDueAt(type, new Date()),
    });
    await this.orders.addEvent({ tenantId, orderId, type: 'EXCEPTION_OPENED', message: `${type}: ${message}`, actorId: actorId ?? null });
    if (canTransition(order.status as never, 'ON_HOLD')) {
      assertTransition(order.status as never, 'ON_HOLD');
      await this.orders.update(tenantId, orderId, { status: 'ON_HOLD', holdReason: `Exception: ${type}` });
    }
    return exception;
  }

  async list(tenantId: string, query: ListExceptionsQuery) {
    return this.exceptions.list(
      tenantId,
      { ...(query.status !== undefined ? { status: query.status } : {}), ...(query.type !== undefined ? { type: query.type } : {}) },
      query.cursor,
      query.limit,
    );
  }

  async acknowledge(tenantId: string, id: string, actorId: string) {
    const existing = await this.exceptions.findById(tenantId, id);
    if (existing === null) {
      throw new NotFoundException({ message: 'Exception not found', code: 'EXCEPTION_NOT_FOUND' });
    }
    return this.exceptions.update(tenantId, id, { status: 'ACKNOWLEDGED' }).then(async (row) => {
      await this.orders.addEvent({ tenantId, orderId: existing.orderId, type: 'EXCEPTION_OPENED', message: 'Exception acknowledged', actorId });
      return row;
    });
  }

  async resolve(tenantId: string, id: string, resolutionNote: string, actorId: string) {
    const existing = await this.exceptions.findById(tenantId, id);
    if (existing === null) {
      throw new NotFoundException({ message: 'Exception not found', code: 'EXCEPTION_NOT_FOUND' });
    }
    const updated = await this.exceptions.update(tenantId, id, { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: actorId, resolutionNote });
    await this.orders.addEvent({ tenantId, orderId: existing.orderId, type: 'EXCEPTION_RESOLVED', message: resolutionNote, actorId });
    const stillOpen = await this.exceptions.listOpenForOrder(tenantId, existing.orderId);
    if (stillOpen.length === 0) {
      const order = await this.orders.findById(tenantId, existing.orderId);
      if (order !== null && order.status === 'ON_HOLD') {
        await this.orders.update(tenantId, existing.orderId, { status: 'CONFIRMED', holdReason: null });
      }
    }
    return updated;
  }

  /** SLA breach sweep (task 5.6) — real, callable, DB-transactional logic;
   * same class of "real but not on a recurring schedule yet" gap as
   * `TokenRefreshService.runSweep`/`ExpiryService.runExpirySweep`
   * (docs/DEBT.md 3-D5/4.5-D3) since no Redis/BullMQ repeatable job or cron
   * is reachable here. */
  async runSlaBreachSweep(): Promise<{ breached: number }> {
    const breached = await this.exceptions.listBreached(new Date());
    for (const exception of breached) {
      await this.exceptions.markBreachAlertSent(exception.id);
      await this.orders.addEvent({ tenantId: exception.tenantId, orderId: exception.orderId, type: 'SLA_BREACHED', message: `SLA breached for ${exception.type} exception` });
      const owners = await this.memberships.listOwnersAndAdmins(exception.tenantId);
      for (const owner of owners) {
        try {
          await this.notifications.dispatch({
            tenantId: exception.tenantId,
            userId: owner.userId,
            type: 'SYSTEM',
            title: 'Order exception SLA breached',
            body: `An order exception (${exception.type}) has passed its SLA window without resolution.`,
            data: { orderId: exception.orderId, exceptionId: exception.id },
          });
        } catch (error) {
          this.logger.warn(`Failed to notify ${owner.userId} of SLA breach: ${String(error)}`);
        }
      }
    }
    return { breached: breached.length };
  }
}
