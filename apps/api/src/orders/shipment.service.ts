import { Injectable, NotFoundException } from '@nestjs/common';
import type { RecordTrackingEventInput, UpdateShipmentInput } from '@omnisell/shared';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { FulfilmentRepository } from '../repositories/fulfilment.repository';
import { OrderRepository } from '../repositories/order.repository';
import { buildCarrierTrackingUrl, estimateDeliveryDate } from './carrier-link.util';
import { assertTransition, canTransition } from './order-status.machine';

/** Shipment + tracking ingestion (featureslist.md 6.6, task 5.5). */
@Injectable()
export class ShipmentService {
  constructor(
    private readonly shipments: ShipmentRepository,
    private readonly fulfilments: FulfilmentRepository,
    private readonly orders: OrderRepository,
  ) {}

  async recordShipped(
    tenantId: string,
    fulfilmentId: string,
    input: { carrier?: string; trackingNumber?: string; transitDays?: number },
  ) {
    const fulfilment = await this.fulfilments.findById(tenantId, fulfilmentId);
    if (fulfilment === null) {
      throw new NotFoundException({ message: 'Fulfilment not found', code: 'FULFILMENT_NOT_FOUND' });
    }
    const shippedAt = new Date();
    const trackingUrl = buildCarrierTrackingUrl(input.carrier, input.trackingNumber);
    const shipment = await this.shipments.create({
      tenantId,
      fulfilmentId,
      carrier: input.carrier ?? null,
      trackingNumber: input.trackingNumber ?? null,
      trackingUrl,
      status: 'IN_TRANSIT',
      shippedAt,
      estimatedDeliveryAt: estimateDeliveryDate(shippedAt, input.transitDays ?? 5),
    });
    await this.fulfilments.update(tenantId, fulfilmentId, { status: 'SHIPPED' });
    const order = await this.orders.findById(tenantId, fulfilment.orderId);
    if (order !== null && canTransition(order.status as never, 'SHIPPED')) {
      assertTransition(order.status as never, 'SHIPPED');
      await this.orders.update(tenantId, fulfilment.orderId, { status: 'SHIPPED' });
      await this.orders.addEvent({ tenantId, orderId: fulfilment.orderId, type: 'SHIPMENT_UPDATED', message: `Shipment created (${input.carrier ?? 'unknown carrier'})` });
    }
    return shipment;
  }

  async update(tenantId: string, shipmentId: string, input: UpdateShipmentInput) {
    const shipment = await this.shipments.findById(tenantId, shipmentId);
    if (shipment === null) {
      throw new NotFoundException({ message: 'Shipment not found', code: 'SHIPMENT_NOT_FOUND' });
    }
    const trackingUrl =
      input.carrier !== undefined || input.trackingNumber !== undefined
        ? buildCarrierTrackingUrl(input.carrier ?? shipment.carrier, input.trackingNumber ?? shipment.trackingNumber)
        : shipment.trackingUrl;
    return this.shipments.update(tenantId, shipmentId, {
      ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.estimatedDeliveryAt !== undefined ? { estimatedDeliveryAt: new Date(input.estimatedDeliveryAt) } : {}),
      trackingUrl,
    });
  }

  async addTrackingEvent(tenantId: string, shipmentId: string, input: RecordTrackingEventInput, actorId?: string) {
    const shipment = await this.shipments.findById(tenantId, shipmentId);
    if (shipment === null) {
      throw new NotFoundException({ message: 'Shipment not found', code: 'SHIPMENT_NOT_FOUND' });
    }
    const event = await this.shipments.addTrackingEvent({
      tenantId,
      shipmentId,
      status: input.status,
      description: input.description ?? null,
      location: input.location ?? null,
      occurredAt: new Date(input.occurredAt),
    });
    if (input.status.toUpperCase() === 'DELIVERED') {
      await this.shipments.update(tenantId, shipmentId, { status: 'DELIVERED', deliveredAt: new Date(input.occurredAt) });
      const fulfilment = await this.fulfilments.findById(tenantId, shipment.fulfilmentId);
      if (fulfilment !== null) {
        await this.fulfilments.update(tenantId, fulfilment.id, { status: 'DELIVERED' });
        const order = await this.orders.findById(tenantId, fulfilment.orderId);
        if (order !== null && canTransition(order.status as never, 'DELIVERED')) {
          await this.orders.update(tenantId, fulfilment.orderId, { status: 'DELIVERED' });
          await this.orders.addEvent({ tenantId, orderId: fulfilment.orderId, type: 'SHIPMENT_UPDATED', message: 'Delivered', actorId: actorId ?? null });
        }
      }
    }
    return event;
  }
}
