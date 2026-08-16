import { Injectable, NotFoundException } from '@nestjs/common';
import type { BlueprintSummary, BlueprintVariantSummary, PrintAreaSpec } from '@omnisell/shared';
import { BlueprintRepository } from '../../repositories/blueprint.repository';

/**
 * Blueprint library — provider catalog CACHE (prompt.md, featureslist.md
 * 3.2). Read-only from the API surface this phase: no live connector sync
 * exists yet (docs/DEBT.md 0-D8), rows are hand-seeded (Phase 3 replaces this
 * with a real `POST /blueprints/sync` job per adapter).
 */
@Injectable()
export class BlueprintsService {
  constructor(private readonly blueprints: BlueprintRepository) {}

  async list(tenantId: string): Promise<BlueprintSummary[]> {
    const rows = await this.blueprints.list(tenantId);
    return rows.map((row) => this.toSummary(row));
  }

  async getOne(tenantId: string, id: string): Promise<BlueprintSummary & { variants: BlueprintVariantSummary[] }> {
    const row = await this.blueprints.findById(tenantId, id);
    if (row === null) {
      throw new NotFoundException('Blueprint not found');
    }
    return {
      ...this.toSummary(row),
      variants: row.variants.map((v) => ({
        id: v.id,
        blueprintId: v.blueprintId,
        providerVariantId: v.providerVariantId,
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        sku: v.sku,
        baseCostMinor: v.baseCostMinor.toString(),
        currency: v.currency,
        inStock: v.inStock,
      })),
    };
  }

  private toSummary(row: {
    id: string;
    providerSlug: string;
    providerBlueprintId: string;
    name: string;
    category: string;
    printAreas: unknown;
    sizes: unknown;
    colors: unknown;
    isActive: boolean;
    syncedAt: Date;
  }): BlueprintSummary {
    return {
      id: row.id,
      providerSlug: row.providerSlug,
      providerBlueprintId: row.providerBlueprintId,
      name: row.name,
      category: row.category,
      printAreas: (row.printAreas ?? []) as PrintAreaSpec[],
      sizes: (row.sizes ?? []) as string[],
      colors: (row.colors ?? []) as BlueprintSummary['colors'],
      isActive: row.isActive,
      syncedAt: row.syncedAt.toISOString(),
    };
  }
}
