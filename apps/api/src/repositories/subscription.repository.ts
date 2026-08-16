import { Injectable } from '@nestjs/common';
import type { AiCreditLedger, Prisma, Subscription, UsageRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Billing (Phase 6, task 6.10): `Subscription ─── UsageRecord ─── AiCreditLedger`
 * per prompt.md's data model. `Subscription` is `@unique` on `tenantId` — one
 * tenant, one active subscription row (matching Stripe Billing's own "one
 * customer, one subscription per product" default shape for this product).
 */
@Injectable()
export class SubscriptionRepository extends TenantScopedRepository<Pick<PrismaService, 'subscription'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async findForTenant(tenantId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({ where: { tenantId } });
  }

  async create(data: Prisma.SubscriptionUncheckedCreateInput): Promise<Subscription> {
    return this.prisma.subscription.create({ data });
  }

  async update(tenantId: string, data: Prisma.SubscriptionUpdateInput): Promise<Subscription | null> {
    const existing = await this.findForTenant(tenantId);
    if (existing === null) {
      return null;
    }
    return this.prisma.subscription.update({ where: { tenantId }, data });
  }

  async recordUsage(data: Prisma.UsageRecordUncheckedCreateInput, client: Client = this.prisma): Promise<UsageRecord> {
    return client.usageRecord.create({ data });
  }

  async listUsage(tenantId: string, kind?: string): Promise<UsageRecord[]> {
    return this.prisma.usageRecord.findMany({ where: { tenantId, ...(kind !== undefined ? { kind } : {}) }, orderBy: { occurredAt: 'desc' }, take: 200 });
  }

  async lastAiCreditBalance(tenantId: string, client: Client = this.prisma): Promise<number> {
    const last = await client.aiCreditLedger.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return last?.balanceAfter ?? 0;
  }

  async postAiCreditEntry(data: Prisma.AiCreditLedgerUncheckedCreateInput, client: Client = this.prisma): Promise<AiCreditLedger> {
    return client.aiCreditLedger.create({ data });
  }

  async listAiCreditHistory(tenantId: string, limit = 100): Promise<AiCreditLedger[]> {
    return this.prisma.aiCreditLedger.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: limit });
  }
}
