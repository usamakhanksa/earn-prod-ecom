import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateManualOrderInput,
  ListOrdersQuery,
  OrderDetail,
  OrderStatus,
  OrderSummary,
  SaveOrderViewInput,
} from '@omnisell/shared';
import { randomUUID } from 'node:crypto';
import { OrderRepository } from '../repositories/order.repository';
import { OrderExceptionRepository } from '../repositories/order-exception.repository';
import { FulfilmentRepository } from '../repositories/fulfilment.repository';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { SavedOrderViewRepository } from '../repositories/saved-order-view.repository';
import { ProductPurchaseWithPointsRepository } from '../repositories/product-purchase-with-points.repository';
import { AuditLogService } from '../audit/audit-log.service';
import { RedemptionService } from '../points/redemption.service';
import { EntitlementService } from '../digital/entitlement.service';
import { assertTransition, releaseTarget } from './order-status.machine';

/**
 * Unified order feed + status machine + saved views + CSV export
 * (featureslist.md 6.1/6.3/6.14, tasks 5.2/5.3). Ingestion (webhook/poll)
 * lives in `OrderIngestionService`; fulfilment submission in
 * `FulfilmentService`; this service owns the Order row's own lifecycle.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly exceptions: OrderExceptionRepository,
    private readonly fulfilments: FulfilmentRepository,
    private readonly shipments: ShipmentRepository,
    private readonly savedViews: SavedOrderViewRepository,
    private readonly pointPurchases: ProductPurchaseWithPointsRepository,
    private readonly redemption: RedemptionService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditLogService,
  ) {}

  async list(tenantId: string, query: ListOrdersQuery): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.orders.list(
      tenantId,
      {
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.connectorSlug !== undefined ? { connectorSlug: query.connectorSlug } : {}),
        ...(query.connectionId !== undefined ? { connectionId: query.connectionId } : {}),
        ...(query.search !== undefined ? { search: query.search } : {}),
        ...(query.placedFrom !== undefined ? { placedFrom: new Date(query.placedFrom) } : {}),
        ...(query.placedTo !== undefined ? { placedTo: new Date(query.placedTo) } : {}),
      },
      query.cursor,
      query.limit,
    );
    const counts = await this.exceptions.countOpenByOrderIds(tenantId, items.map((o) => o.id));
    return { items: items.map((o) => toSummary(o, counts[o.id] ?? 0)), nextCursor };
  }

  async getDetail(tenantId: string, id: string): Promise<OrderDetail> {
    const order = await this.orders.findById(tenantId, id);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const [allExceptions, fulfilmentRows, events, shipmentRows] = await Promise.all([
      this.exceptions.listAllForOrder(tenantId, id),
      this.fulfilments.listForOrder(tenantId, id),
      this.orders.listEvents(tenantId, id),
      this.shipments.listForOrder(tenantId, id),
    ]);
    const fulfilmentViews = fulfilmentRows.map((f) => {
      const forThisFulfilment = shipmentRows.filter((s) => s.fulfilmentId === f.id);
      return {
        id: f.id,
        orderItemId: f.orderItemId,
        connectionId: f.connectionId,
        connectorSlug: f.connectorSlug,
        externalFulfilmentId: f.externalFulfilmentId,
        status: f.status,
        routingStrategy: f.routingStrategy,
        lastError: f.lastError,
        shipments: forThisFulfilment.map((s) => ({
          id: s.id,
          carrier: s.carrier,
          trackingNumber: s.trackingNumber,
          trackingUrl: s.trackingUrl,
          status: s.status,
          shippedAt: s.shippedAt?.toISOString() ?? null,
          estimatedDeliveryAt: s.estimatedDeliveryAt?.toISOString() ?? null,
          deliveredAt: s.deliveredAt?.toISOString() ?? null,
          trackingEvents: s.trackingEvents.map((e) => ({
            id: e.id,
            status: e.status,
            description: e.description,
            location: e.location,
            occurredAt: e.occurredAt.toISOString(),
          })),
        })),
        createdAt: f.createdAt.toISOString(),
      };
    });

    return {
      ...toSummary(order, allExceptions.filter((e) => ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'].includes(e.status)).length),
      subtotalMinor: order.subtotalMinor.toString(),
      discountMinor: order.discountMinor.toString(),
      taxMinor: order.taxMinor.toString(),
      shippingMinor: order.shippingMinor.toString(),
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      holdReason: order.holdReason,
      cancelReason: order.cancelReason,
      items: order.items.map((i) => ({
        id: i.id,
        title: i.title,
        sku: i.sku,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor.toString(),
        totalPriceMinor: i.totalPriceMinor.toString(),
        currency: i.currency,
        isDigital: i.isDigital,
        digitalProductId: i.digitalProductId,
        productVariantId: i.productVariantId,
      })),
      fees: order.fees.map((f) => ({ id: f.id, type: f.type, amountMinor: f.amountMinor.toString(), currency: f.currency, note: f.note })),
      exceptions: allExceptions.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        type: e.type,
        status: e.status,
        message: e.message,
        slaDueAt: e.slaDueAt?.toISOString() ?? null,
        breachedAt: e.breachedAt?.toISOString() ?? null,
        resolvedAt: e.resolvedAt?.toISOString() ?? null,
        resolutionNote: e.resolutionNote,
        createdAt: e.createdAt.toISOString(),
      })),
      fulfilments: fulfilmentViews,
      events: events.map((e) => ({ id: e.id, type: e.type, message: e.message, payload: e.payload, actorId: e.actorId, createdAt: e.createdAt.toISOString() })),
    };
  }

  async createManualOrder(tenantId: string, actorId: string, input: CreateManualOrderInput): Promise<OrderDetail> {
    const items = input.items.map((item) => ({
      title: item.title,
      sku: item.sku ?? null,
      quantity: item.quantity,
      unitPriceMinor: BigInt(item.unitPriceMinor),
      totalPriceMinor: BigInt(item.unitPriceMinor) * BigInt(item.quantity),
      currency: input.currency,
      isDigital: item.isDigital,
      digitalProductId: item.digitalProductId ?? null,
      productVariantId: item.productVariantId ?? null,
    }));
    const subtotalMinor = items.reduce((sum, i) => sum + i.totalPriceMinor, 0n);
    const shippingMinor = BigInt(input.shippingMinor);
    const taxMinor = BigInt(input.taxMinor);
    const order = await this.orders.createWithItems(
      {
        tenantId,
        connectorSlug: 'manual',
        externalOrderId: null,
        orderNumber: `M-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: 'NEW',
        buyerName: input.buyerName ?? null,
        buyerEmail: input.buyerEmail ?? null,
        ...(input.shippingAddress !== undefined ? { shippingAddress: input.shippingAddress } : {}),
        ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
        currency: input.currency,
        subtotalMinor,
        shippingMinor,
        taxMinor,
        totalMinor: subtotalMinor + shippingMinor + taxMinor,
        placedAt: new Date(),
        ingestSource: 'manual',
        createdById: actorId,
      },
      items,
      [],
    );
    await this.orders.addEvent({ tenantId, orderId: order.id, type: 'INGESTED', message: 'Manual order created', actorId });
    await this.audit.record({ tenantId, actorId, action: 'order.created', entityType: 'Order', entityId: order.id, after: { orderNumber: order.orderNumber } });

    // Digital-only sale (task 5.10/7.4) — a manual order is the one path
    // where OmniSell itself knows the buyer AND the DigitalProduct at
    // creation time, so entitlements are granted immediately rather than
    // requiring a separate manual step. Channel-ingested orders don't carry
    // a DigitalProduct mapping (see EntitlementService's doc comment).
    for (const item of order.items) {
      if (item.isDigital && item.digitalProductId !== null) {
        await this.entitlements.grant(tenantId, {
          digitalProductId: item.digitalProductId,
          ...(order.buyerEmail !== null ? { buyerEmail: order.buyerEmail } : {}),
          orderId: order.id,
          orderItemId: item.id,
        });
      }
    }

    return this.getDetail(tenantId, order.id);
  }

  async transition(tenantId: string, actorId: string, id: string, to: OrderStatus, note?: string): Promise<OrderDetail> {
    const order = await this.orders.findById(tenantId, id);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    assertTransition(order.status as OrderStatus, to);
    const patch: Record<string, unknown> = { status: to };
    if (to === 'ON_HOLD' && note !== undefined) patch.holdReason = note;
    if (to === 'CANCELLED') {
      patch.cancelReason = note ?? null;
      patch.cancelledAt = new Date();
    }
    if (to === 'CLOSED') patch.closedAt = new Date();
    await this.orders.update(tenantId, id, patch);
    await this.orders.addEvent({ tenantId, orderId: id, type: 'STATUS_CHANGE', message: `${order.status} -> ${to}`, actorId, ...(note !== undefined ? { payload: { note } } : {}) });
    await this.audit.record({ tenantId, actorId, action: 'order.status_changed', entityType: 'Order', entityId: id, before: { status: order.status }, after: { status: to } });

    // Real order-cancellation/refund -> points-redemption-refund wiring
    // (closes docs/DEBT.md 4.5-D6): a CANCELLED or REFUNDED order that carried
    // a confirmed points redemption discount gets those points restored via
    // RedemptionService's existing, already-tested refund logic (a fresh
    // EARN row, never a mutated historical transaction) — fired from THIS
    // real code path, not merely available in isolation.
    if (to === 'CANCELLED' || to === 'REFUNDED') {
      const confirmedRedemptions = await this.pointPurchases.findConfirmedByOrderId(tenantId, id);
      for (const purchase of confirmedRedemptions) {
        await this.redemption.refund(tenantId, purchase.id);
        await this.orders.addEvent({ tenantId, orderId: id, type: 'COMMENT', message: `Points redemption ${purchase.id} refunded (${purchase.pointsUsed} points restored)`, actorId });
      }
    }

    return this.getDetail(tenantId, id);
  }

  async hold(tenantId: string, actorId: string, id: string, reason: string): Promise<OrderDetail> {
    return this.transition(tenantId, actorId, id, 'ON_HOLD', reason);
  }

  async release(tenantId: string, actorId: string, id: string): Promise<OrderDetail> {
    const order = await this.orders.findById(tenantId, id);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    if (order.status !== 'ON_HOLD') {
      throw new ConflictException({ message: 'Order is not on hold', code: 'ORDER_NOT_ON_HOLD' });
    }
    // The event log's last STATUS_CHANGE into ON_HOLD tells us where to
    // return to; default to CONFIRMED (the common real-world case) if none found.
    const events = await this.orders.listEvents(tenantId, id);
    const holdEvent = [...events].reverse().find((e) => e.type === 'STATUS_CHANGE' && e.message.endsWith('-> ON_HOLD'));
    const previous = (holdEvent?.message.split(' -> ')[0] ?? 'CONFIRMED') as OrderStatus;
    return this.transition(tenantId, actorId, id, releaseTarget(previous));
  }

  async cancel(tenantId: string, actorId: string, id: string, reason: string): Promise<OrderDetail> {
    return this.transition(tenantId, actorId, id, 'CANCELLED', reason);
  }

  // --- Saved views (5.3) ---

  async listSavedViews(tenantId: string, userId: string) {
    const rows = await this.savedViews.list(tenantId, userId);
    return rows.map((r) => ({ id: r.id, name: r.name, filters: r.filters }));
  }

  async saveView(tenantId: string, userId: string, input: SaveOrderViewInput) {
    const row = await this.savedViews.upsert(tenantId, userId, input.name, input.filters as Prisma.InputJsonValue);
    return { id: row.id, name: row.name, filters: row.filters };
  }

  async deleteView(tenantId: string, userId: string, id: string): Promise<{ ok: boolean }> {
    return { ok: await this.savedViews.delete(tenantId, userId, id) };
  }

  // --- CSV export (6.14) ---

  async exportCsv(tenantId: string, query: ListOrdersQuery): Promise<string> {
    const rows = await this.orders.listAllForExport(
      tenantId,
      {
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.connectorSlug !== undefined ? { connectorSlug: query.connectorSlug } : {}),
      },
      5000,
    );
    const header = ['Order Number', 'Status', 'Buyer', 'Email', 'Currency', 'Total', 'Placed At'];
    const lines = [header.join(',')];
    for (const o of rows) {
      lines.push(
        [
          csvCell(o.orderNumber),
          csvCell(o.status),
          csvCell(o.buyerName ?? ''),
          csvCell(o.buyerEmail ?? ''),
          csvCell(o.currency),
          csvCell((Number(o.totalMinor) / 100).toFixed(2)),
          csvCell(o.placedAt.toISOString()),
        ].join(','),
      );
    }
    return lines.join('\r\n');
  }
}

interface SummarySource {
  id: string;
  orderNumber: string;
  connectorSlug: string;
  externalOrderId: string | null;
  status: string;
  buyerName: string | null;
  buyerEmail: string | null;
  currency: string;
  totalMinor: bigint;
  placedAt: Date;
  createdAt: Date;
}

function toSummary(order: SummarySource, openExceptionCount: number): OrderSummary {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    connectorSlug: order.connectorSlug,
    externalOrderId: order.externalOrderId,
    status: order.status,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    currency: order.currency,
    totalMinor: order.totalMinor.toString(),
    placedAt: order.placedAt.toISOString(),
    openExceptionCount,
    createdAt: order.createdAt.toISOString(),
  };
}

function csvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
