import { Injectable } from '@nestjs/common';
import type { Prisma, Shipment, TrackingEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ShipmentRepository extends TenantScopedRepository<Pick<PrismaService, 'shipment'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.ShipmentUncheckedCreateInput): Promise<Shipment> {
    return this.prisma.shipment.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<Shipment | null> {
    return this.prisma.shipment.findFirst({ where: { id, tenantId } });
  }

  async listForFulfilment(tenantId: string, fulfilmentId: string): Promise<Shipment[]> {
    return this.prisma.shipment.findMany({ where: { tenantId, fulfilmentId } });
  }

  async listForOrder(tenantId: string, orderId: string): Promise<Array<Shipment & { trackingEvents: TrackingEvent[] }>> {
    return this.prisma.shipment.findMany({
      where: { tenantId, fulfilment: { orderId } },
      include: { trackingEvents: { orderBy: { occurredAt: 'asc' } } },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.ShipmentUpdateInput): Promise<Shipment | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.shipment.update({ where: { id }, data });
  }

  async addTrackingEvent(input: Prisma.TrackingEventUncheckedCreateInput): Promise<TrackingEvent> {
    return this.prisma.trackingEvent.create({ data: input });
  }

  async listTrackingEvents(tenantId: string, shipmentId: string): Promise<TrackingEvent[]> {
    return this.prisma.trackingEvent.findMany({ where: { tenantId, shipmentId }, orderBy: { occurredAt: 'asc' } });
  }
}
