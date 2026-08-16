import { Injectable } from '@nestjs/common';
import type { Blueprint, BlueprintVariant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Blueprint = provider catalog CACHE (prompt.md). Tenant-scoped this phase
 * (docs/OPEN_QUESTIONS.md) — hand-seeded, read-only from the API surface
 * until Phase 3's real connector sync lands (docs/DEBT.md 0-D8).
 */
@Injectable()
export class BlueprintRepository extends TenantScopedRepository<Pick<PrismaService, 'blueprint'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async list(tenantId: string): Promise<Array<Blueprint & { variants: BlueprintVariant[] }>> {
    return this.prisma.blueprint.findMany({
      where: { tenantId, isActive: true },
      include: { variants: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string): Promise<(Blueprint & { variants: BlueprintVariant[] }) | null> {
    return this.prisma.blueprint.findFirst({ where: { id, tenantId }, include: { variants: true } });
  }

  async upsertSeed(input: {
    tenantId: string;
    providerSlug: string;
    providerBlueprintId: string;
    name: string;
    category: string;
    printAreas: Prisma.InputJsonValue;
    sizes: Prisma.InputJsonValue;
    colors: Prisma.InputJsonValue;
  }): Promise<Blueprint> {
    return this.prisma.blueprint.upsert({
      where: {
        tenantId_providerSlug_providerBlueprintId: {
          tenantId: input.tenantId,
          providerSlug: input.providerSlug,
          providerBlueprintId: input.providerBlueprintId,
        },
      },
      update: {
        name: input.name,
        category: input.category,
        printAreas: input.printAreas,
        sizes: input.sizes,
        colors: input.colors,
        syncedAt: new Date(),
      },
      create: {
        tenantId: input.tenantId,
        providerSlug: input.providerSlug,
        providerBlueprintId: input.providerBlueprintId,
        name: input.name,
        category: input.category,
        printAreas: input.printAreas,
        sizes: input.sizes,
        colors: input.colors,
      },
    });
  }

  async upsertVariant(input: {
    blueprintId: string;
    tenantId: string;
    providerVariantId: string;
    size: string;
    color: string;
    colorHex?: string;
    sku?: string;
    baseCostMinor: bigint;
    currency: string;
  }): Promise<BlueprintVariant> {
    return this.prisma.blueprintVariant.upsert({
      where: { blueprintId_providerVariantId: { blueprintId: input.blueprintId, providerVariantId: input.providerVariantId } },
      update: {
        size: input.size,
        color: input.color,
        colorHex: input.colorHex ?? null,
        sku: input.sku ?? null,
        baseCostMinor: input.baseCostMinor,
        currency: input.currency,
      },
      create: {
        blueprintId: input.blueprintId,
        tenantId: input.tenantId,
        providerVariantId: input.providerVariantId,
        size: input.size,
        color: input.color,
        colorHex: input.colorHex ?? null,
        sku: input.sku ?? null,
        baseCostMinor: input.baseCostMinor,
        currency: input.currency,
      },
    });
  }

  async findVariantById(tenantId: string, id: string): Promise<BlueprintVariant | null> {
    return this.prisma.blueprintVariant.findFirst({ where: { id, tenantId } });
  }
}
