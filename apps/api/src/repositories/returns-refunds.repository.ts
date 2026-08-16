import { Injectable } from '@nestjs/common';
import type { Prisma, Refund, Reprint, Return } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

/** Returns/Refunds/Reprints (task 5.7) — three small, always-co-read tables
 * grouped in one repository. */
@Injectable()
export class ReturnsRefundsRepository extends TenantScopedRepository<Pick<PrismaService, 'return'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createReturn(input: Prisma.ReturnUncheckedCreateInput): Promise<Return> {
    return this.prisma.return.create({ data: input });
  }

  async findReturnById(tenantId: string, id: string): Promise<Return | null> {
    return this.prisma.return.findFirst({ where: { id, tenantId } });
  }

  async listReturnsForOrder(tenantId: string, orderId: string): Promise<Return[]> {
    return this.prisma.return.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
  }

  async updateReturn(tenantId: string, id: string, data: Prisma.ReturnUpdateInput): Promise<Return | null> {
    const existing = await this.findReturnById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.return.update({ where: { id }, data });
  }

  async createRefund(input: Prisma.RefundUncheckedCreateInput, client: Client = this.prisma): Promise<Refund> {
    return client.refund.create({ data: input });
  }

  async findRefundById(tenantId: string, id: string): Promise<Refund | null> {
    return this.prisma.refund.findFirst({ where: { id, tenantId } });
  }

  async findRefundByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Refund | null> {
    return this.prisma.refund.findFirst({ where: { tenantId, idempotencyKey } });
  }

  async listRefundsForOrder(tenantId: string, orderId: string): Promise<Refund[]> {
    return this.prisma.refund.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
  }

  async sumCompletedRefunds(tenantId: string, orderId: string): Promise<bigint> {
    const rows = await this.prisma.refund.findMany({ where: { tenantId, orderId, status: 'COMPLETED' }, select: { amountMinor: true } });
    return rows.reduce((sum, r) => sum + r.amountMinor, 0n);
  }

  async updateRefund(tenantId: string, id: string, data: Prisma.RefundUpdateInput, client: Client = this.prisma): Promise<Refund | null> {
    const existing = await client.refund.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return client.refund.update({ where: { id }, data });
  }

  async createReprint(input: Prisma.ReprintUncheckedCreateInput): Promise<Reprint> {
    return this.prisma.reprint.create({ data: input });
  }

  async findReprintById(tenantId: string, id: string): Promise<Reprint | null> {
    return this.prisma.reprint.findFirst({ where: { id, tenantId } });
  }

  async listReprintsForOrder(tenantId: string, orderId: string): Promise<Reprint[]> {
    return this.prisma.reprint.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
  }

  async updateReprint(tenantId: string, id: string, data: Prisma.ReprintUpdateInput): Promise<Reprint | null> {
    const existing = await this.findReprintById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.reprint.update({ where: { id }, data });
  }
}
