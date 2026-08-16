import { Injectable } from '@nestjs/common';
import type { Order, OrderEvent, OrderFee, OrderItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

export interface OrderListFilters {
  status?: string[];
  connectorSlug?: string;
  connectionId?: string;
  search?: string; // matches orderNumber / buyerName / buyerEmail
  placedFrom?: Date;
  placedTo?: Date;
}

export type OrderWithItems = Order & { items: OrderItem[]; fees: OrderFee[] };

/**
 * Order (task 5.1/5.2/5.3). Owns Order + its two always-created-alongside
 * children (OrderItem, OrderFee) so a single ingestion/creation call is one
 * cohesive repository method, matching this codebase's existing "one
 * repository per closely-related cluster" convention (e.g. `ListingRepository`
 * pattern from Phase 4) rather than a separate repo per child table.
 */
@Injectable()
export class OrderRepository extends TenantScopedRepository<Pick<PrismaService, 'order'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createWithItems(
    order: Prisma.OrderUncheckedCreateInput,
    items: Array<Omit<Prisma.OrderItemUncheckedCreateInput, 'orderId' | 'tenantId'>>,
    fees: Array<Omit<Prisma.OrderFeeUncheckedCreateInput, 'orderId' | 'tenantId'>>,
    client: Client = this.prisma,
  ): Promise<OrderWithItems> {
    return client.order.create({
      data: {
        ...order,
        items: { create: items.map((i) => ({ ...i, tenantId: order.tenantId })) },
        fees: { create: fees.map((f) => ({ ...f, tenantId: order.tenantId })) },
      },
      include: { items: true, fees: true },
    });
  }

  async findById(tenantId: string, id: string, client: Client = this.prisma): Promise<OrderWithItems | null> {
    return client.order.findFirst({ where: { id, tenantId }, include: { items: true, fees: true } });
  }

  async findByExternalId(tenantId: string, connectorSlug: string, externalOrderId: string): Promise<Order | null> {
    return this.prisma.order.findFirst({ where: { tenantId, connectorSlug, externalOrderId } });
  }

  async list(
    tenantId: string,
    filters: OrderListFilters,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: Order[]; nextCursor: string | null }> {
    const where: Prisma.OrderWhereInput = { tenantId };
    if (filters.status !== undefined && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters.connectorSlug !== undefined) {
      where.connectorSlug = filters.connectorSlug;
    }
    if (filters.connectionId !== undefined) {
      where.connectionId = filters.connectionId;
    }
    if (filters.placedFrom !== undefined || filters.placedTo !== undefined) {
      where.placedAt = {
        ...(filters.placedFrom !== undefined ? { gte: filters.placedFrom } : {}),
        ...(filters.placedTo !== undefined ? { lte: filters.placedTo } : {}),
      };
    }
    if (filters.search !== undefined && filters.search.length > 0) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { buyerName: { contains: filters.search, mode: 'insensitive' } },
        { buyerEmail: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor !== undefined ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last !== undefined ? last.id : null };
  }

  async update(tenantId: string, id: string, data: Prisma.OrderUpdateInput, client: Client = this.prisma): Promise<Order | null> {
    const existing = await client.order.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return client.order.update({ where: { id }, data });
  }

  async addEvent(input: Prisma.OrderEventUncheckedCreateInput, client: Client = this.prisma): Promise<OrderEvent> {
    return client.orderEvent.create({ data: input });
  }

  async listEvents(tenantId: string, orderId: string): Promise<OrderEvent[]> {
    return this.prisma.orderEvent.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'asc' } });
  }

  async addFee(input: Prisma.OrderFeeUncheckedCreateInput, client: Client = this.prisma): Promise<OrderFee> {
    return client.orderFee.create({ data: input });
  }

  async listFees(tenantId: string, orderId: string): Promise<OrderFee[]> {
    return this.prisma.orderFee.findMany({ where: { tenantId, orderId } });
  }

  async listItems(tenantId: string, orderId: string): Promise<OrderItem[]> {
    return this.prisma.orderItem.findMany({ where: { tenantId, orderId } });
  }

  async findItemById(tenantId: string, id: string): Promise<OrderItem | null> {
    return this.prisma.orderItem.findFirst({ where: { id, tenantId } });
  }

  /** CSV export (task 5.3/6.14) — same filter set as `list`, unpaged (caller
   * bounds the count via a hard cap in the service layer). */
  async listAllForExport(tenantId: string, filters: OrderListFilters, hardCap: number): Promise<OrderWithItems[]> {
    const where: Prisma.OrderWhereInput = { tenantId };
    if (filters.status !== undefined && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters.connectorSlug !== undefined) {
      where.connectorSlug = filters.connectorSlug;
    }
    // Phase 6 fix: `connectionId`/`placedFrom`/`placedTo` were accepted by
    // `OrderListFilters` but silently ignored here — a real gap for CSV
    // export (5.3/6.14) that Phase 6's period-bounded finance queries
    // (fee decomposition, P&L, reconciliation) also depend on, so it is
    // fixed here rather than duplicating a second period-filtered query.
    if (filters.connectionId !== undefined) {
      where.connectionId = filters.connectionId;
    }
    if (filters.placedFrom !== undefined || filters.placedTo !== undefined) {
      where.placedAt = {
        ...(filters.placedFrom !== undefined ? { gte: filters.placedFrom } : {}),
        ...(filters.placedTo !== undefined ? { lte: filters.placedTo } : {}),
      };
    }
    return this.prisma.order.findMany({ where, orderBy: { placedAt: 'desc' }, take: hardCap, include: { items: true, fees: true } });
  }
}
