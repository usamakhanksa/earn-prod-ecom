import { Injectable } from '@nestjs/common';
import type { Fulfilment, FulfilmentRoutingRule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

/** Fulfilment submissions + the tenant's routing-rule configuration (task
 * 5.4) — grouped because the routing rules exist only to decide a
 * Fulfilment's `connectionId`/`routingStrategy`, never read independently. */
@Injectable()
export class FulfilmentRepository extends TenantScopedRepository<Pick<PrismaService, 'fulfilment'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.FulfilmentUncheckedCreateInput, client: Client = this.prisma): Promise<Fulfilment> {
    return client.fulfilment.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<Fulfilment | null> {
    return this.prisma.fulfilment.findFirst({ where: { id, tenantId } });
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Fulfilment | null> {
    return this.prisma.fulfilment.findFirst({ where: { tenantId, idempotencyKey } });
  }

  async listForOrder(tenantId: string, orderId: string): Promise<Fulfilment[]> {
    return this.prisma.fulfilment.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'asc' } });
  }

  async update(tenantId: string, id: string, data: Prisma.FulfilmentUpdateInput): Promise<Fulfilment | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.fulfilment.update({ where: { id }, data });
  }

  // --- Routing rules ---

  async listActiveRoutingRules(tenantId: string): Promise<FulfilmentRoutingRule[]> {
    return this.prisma.fulfilmentRoutingRule.findMany({ where: { tenantId, isActive: true }, orderBy: { priority: 'asc' } });
  }

  async listAllRoutingRules(tenantId: string): Promise<FulfilmentRoutingRule[]> {
    return this.prisma.fulfilmentRoutingRule.findMany({ where: { tenantId }, orderBy: { priority: 'asc' } });
  }

  async createRoutingRule(input: Prisma.FulfilmentRoutingRuleUncheckedCreateInput): Promise<FulfilmentRoutingRule> {
    return this.prisma.fulfilmentRoutingRule.create({ data: input });
  }

  async updateRoutingRule(tenantId: string, id: string, data: Prisma.FulfilmentRoutingRuleUpdateInput): Promise<FulfilmentRoutingRule | null> {
    const existing = await this.prisma.fulfilmentRoutingRule.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.fulfilmentRoutingRule.update({ where: { id }, data });
  }

  async deleteRoutingRule(tenantId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.fulfilmentRoutingRule.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return false;
    }
    await this.prisma.fulfilmentRoutingRule.delete({ where: { id } });
    return true;
  }
}
