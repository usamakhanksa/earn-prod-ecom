import { Injectable } from '@nestjs/common';
import type { Prisma, PricingRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class PricingRuleRepository extends TenantScopedRepository<Pick<PrismaService, 'pricingRule'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.PricingRuleUncheckedCreateInput): Promise<PricingRule> {
    return this.prisma.pricingRule.create({ data });
  }

  async list(tenantId: string): Promise<PricingRule[]> {
    return this.prisma.pricingRule.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async findById(tenantId: string, id: string): Promise<PricingRule | null> {
    return this.prisma.pricingRule.findFirst({ where: { id, tenantId } });
  }

  async update(tenantId: string, id: string, data: Prisma.PricingRuleUpdateInput): Promise<PricingRule | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.pricingRule.update({ where: { id }, data });
  }
}
