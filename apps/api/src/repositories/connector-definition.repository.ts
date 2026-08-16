import { Injectable } from '@nestjs/common';
import type { ConnectorDefinition, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `ConnectorDefinition` is the deliberate GLOBAL, non-tenant-scoped exception
 * (prompt.md's explicit "Global (non-tenant)" list — see the schema comment
 * on the model itself). This repository intentionally does NOT extend
 * `TenantScopedRepository` — there is no `tenantId` to inject, every tenant
 * reads the exact same registry rows. Same shape as `FeatureFlagRepository`
 * would be for the global `FeatureFlag` definition (as opposed to its
 * tenant-scoped `FeatureFlagTarget`).
 */
@Injectable()
export class ConnectorDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { tier?: string; category?: string; includeQuarantined: boolean }): Promise<ConnectorDefinition[]> {
    const where: Prisma.ConnectorDefinitionWhereInput = {};
    if (filter.tier !== undefined) {
      where.tier = filter.tier;
    }
    if (filter.category !== undefined) {
      where.category = filter.category;
    }
    if (!filter.includeQuarantined) {
      where.status = { not: 'UNVERIFIED' };
    }
    return this.prisma.connectorDefinition.findMany({ where, orderBy: [{ tier: 'asc' }, { name: 'asc' }] });
  }

  async findBySlug(slug: string): Promise<ConnectorDefinition | null> {
    return this.prisma.connectorDefinition.findUnique({ where: { slug } });
  }

  async findById(id: string): Promise<ConnectorDefinition | null> {
    return this.prisma.connectorDefinition.findUnique({ where: { id } });
  }

  async create(data: Prisma.ConnectorDefinitionUncheckedCreateInput): Promise<ConnectorDefinition> {
    return this.prisma.connectorDefinition.create({ data });
  }

  async update(id: string, data: Prisma.ConnectorDefinitionUpdateInput): Promise<ConnectorDefinition> {
    return this.prisma.connectorDefinition.update({ where: { id }, data });
  }

  async upsertBySlug(slug: string, data: Prisma.ConnectorDefinitionUncheckedCreateInput): Promise<ConnectorDefinition> {
    const { slug: _slug, ...updateData } = data;
    return this.prisma.connectorDefinition.upsert({
      where: { slug },
      create: data,
      update: updateData,
    });
  }
}
