import { Injectable } from '@nestjs/common';
import type { OrderException, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class OrderExceptionRepository extends TenantScopedRepository<Pick<PrismaService, 'orderException'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.OrderExceptionUncheckedCreateInput): Promise<OrderException> {
    return this.prisma.orderException.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<OrderException | null> {
    return this.prisma.orderException.findFirst({ where: { id, tenantId } });
  }

  async listOpenForOrder(tenantId: string, orderId: string): Promise<OrderException[]> {
    return this.prisma.orderException.findMany({ where: { tenantId, orderId, status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] } } });
  }

  /** Every exception (open or resolved) for one order — the order detail
   * view's full history, not just the actionable subset. */
  async listAllForOrder(tenantId: string, orderId: string): Promise<OrderException[]> {
    return this.prisma.orderException.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
  }

  /** Feed summary's "open exception count" badge — one grouped query for a
   * whole page of orders rather than N+1 per-row queries. */
  async countOpenByOrderIds(tenantId: string, orderIds: string[]): Promise<Record<string, number>> {
    if (orderIds.length === 0) {
      return {};
    }
    const rows = await this.prisma.orderException.groupBy({
      by: ['orderId'],
      where: { tenantId, orderId: { in: orderIds }, status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] } },
      _count: { _all: true },
    });
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.orderId] = row._count._all;
    }
    return result;
  }

  async list(
    tenantId: string,
    filters: { status?: string[]; type?: string },
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: OrderException[]; nextCursor: string | null }> {
    const where: Prisma.OrderExceptionWhereInput = { tenantId };
    if (filters.status !== undefined && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters.type !== undefined) {
      where.type = filters.type;
    }
    const rows = await this.prisma.orderException.findMany({
      where,
      orderBy: [{ slaDueAt: 'asc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor !== undefined ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last !== undefined ? last.id : null };
  }

  async update(tenantId: string, id: string, data: Prisma.OrderExceptionUpdateInput): Promise<OrderException | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.orderException.update({ where: { id }, data });
  }

  /** SLA sweep's scan (task 5.6) — every OPEN/ACKNOWLEDGED/ESCALATED row past
   * `slaDueAt` that hasn't already had a breach alert sent. */
  async listBreached(now: Date): Promise<OrderException[]> {
    return this.prisma.orderException.findMany({
      where: {
        status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] },
        slaDueAt: { lte: now },
        breachAlertSentAt: null,
      },
    });
  }

  async markBreachAlertSent(id: string): Promise<void> {
    await this.prisma.orderException.update({ where: { id }, data: { breachedAt: new Date(), breachAlertSentAt: new Date() } });
  }

  /**
   * Admin "Order Exceptions / SLA Breaches" board — platform-wide, every
   * tenant's still-open exception past its SLA window (regardless of
   * whether a breach alert was already sent to that tenant, unlike
   * `listBreached` above which is the sweep's own "notify once" query).
   * Deliberately cross-tenant, same reasoning as
   * `OrderIngestionRepository.listConnectionsForPolling` and
   * `AdminQueuesController`'s own platform-wide queue board.
   */
  async listBreachedAcrossTenantsForAdmin(now: Date): Promise<Array<{ id: string; tenantId: string; tenantName: string; orderId: string; type: string; status: string; slaDueAt: Date | null; createdAt: Date }>> {
    const rows = await this.prisma.orderException.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] }, slaDueAt: { lte: now } },
      include: { tenant: { select: { name: true } } },
      orderBy: { slaDueAt: 'asc' },
      take: 200,
    });
    return rows.map((r) => ({ id: r.id, tenantId: r.tenantId, tenantName: r.tenant.name, orderId: r.orderId, type: r.type, status: r.status, slaDueAt: r.slaDueAt, createdAt: r.createdAt }));
  }
}
