import { Injectable } from '@nestjs/common';
import type { PointEarningRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export interface UpsertEarningRuleInput {
  tenantId: string;
  action: string;
  points: number;
  minWatchSeconds?: number | null | undefined;
  maxDailyCap?: number | null | undefined;
  cooldownSeconds?: number | null | undefined;
  isActive: boolean;
}

/** `PointEarningRule` — rule resolution's first lookup (§7.1). */
@Injectable()
export class PointEarningRuleRepository extends TenantScopedRepository<Pick<PrismaService, 'pointEarningRule'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async findActiveForAction(tenantId: string, action: string): Promise<PointEarningRule | null> {
    return this.prisma.pointEarningRule.findFirst({ where: { tenantId, action, isActive: true } });
  }

  async listAll(tenantId: string): Promise<PointEarningRule[]> {
    return this.prisma.pointEarningRule.findMany({ where: { tenantId }, orderBy: { action: 'asc' } });
  }

  async listActive(tenantId: string): Promise<PointEarningRule[]> {
    return this.prisma.pointEarningRule.findMany({ where: { tenantId, isActive: true }, orderBy: { action: 'asc' } });
  }

  async upsert(input: UpsertEarningRuleInput): Promise<PointEarningRule> {
    return this.prisma.pointEarningRule.upsert({
      where: { tenantId_action: { tenantId: input.tenantId, action: input.action } },
      create: {
        tenantId: input.tenantId,
        action: input.action,
        points: input.points,
        minWatchSeconds: input.minWatchSeconds ?? null,
        maxDailyCap: input.maxDailyCap ?? null,
        cooldownSeconds: input.cooldownSeconds ?? null,
        isActive: input.isActive,
      },
      update: {
        points: input.points,
        minWatchSeconds: input.minWatchSeconds ?? null,
        maxDailyCap: input.maxDailyCap ?? null,
        cooldownSeconds: input.cooldownSeconds ?? null,
        isActive: input.isActive,
      },
    });
  }
}
