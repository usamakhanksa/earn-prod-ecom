import { Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `Plan` is GLOBAL, not tenant-scoped (prompt.md's explicit "Global
 * (non-tenant)" model list) — every tenant picks from the same catalog of
 * billing plans, same pattern as `ConnectorDefinitionRepository`.
 */
@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<Plan[]> {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMinor: 'asc' } });
  }

  async findBySlug(slug: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { slug } });
  }
}
