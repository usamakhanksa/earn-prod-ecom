import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Blueprint as AdapterBlueprint } from '@omnisell/connectors';
import { BlueprintRepository } from '../../repositories/blueprint.repository';
import { ConnectionRepository } from '../../repositories/connection.repository';
import { AdapterRunnerService } from '../../connections/adapter-runner.service';
import { AuditLogService } from '../../audit/audit-log.service';

export interface BlueprintSyncResult {
  connectorSlug: string;
  blueprintsSynced: number;
  variantsSynced: number;
}

/**
 * Replaces Phase 2's hand-seeded `Blueprint`/`BlueprintVariant` rows with a
 * REAL provider sync (docs/CONNECTORS.md — "Phase 3 replaces the seed with a
 * real POST /blueprints/sync job per adapter"). Writes into the exact same
 * tables Phase 2 hand-seeded, via the exact same repository methods
 * (`upsertSeed`/`upsertVariant`) — no second migration needed, as promised in
 * that phase's report.
 *
 * This is real, MSW-tested-at-the-adapter-level logic — it genuinely cannot
 * complete against a live provider in this sandbox (no network access to a
 * real Printful/Printify/Gelato/Prodigi account, no real credentials,
 * docs/DEBT.md) unless a tenant has a real CONNECTED connection, which none
 * do here. The mapping/upsert logic itself is unit-tested against a fake
 * adapter returning canned `Blueprint[]` data (test/blueprint-sync.service.test.ts).
 */
@Injectable()
export class BlueprintSyncService {
  private readonly logger = new Logger(BlueprintSyncService.name);

  constructor(
    private readonly blueprints: BlueprintRepository,
    private readonly connections: ConnectionRepository,
    private readonly runner: AdapterRunnerService,
    private readonly audit: AuditLogService,
  ) {}

  async syncFromConnection(tenantId: string, connectionId: string, userId: string): Promise<BlueprintSyncResult> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }

    const adapterBlueprints = await this.runner.run(tenantId, connectionId, async (adapter, ctx) => {
      if (adapter.fetchBlueprints === undefined) {
        throw new BadRequestException(`Connector "${connection.connectorSlug}" does not support catalog sync`);
      }
      return adapter.fetchBlueprints(ctx);
    });

    let variantsSynced = 0;
    for (const blueprint of adapterBlueprints) {
      variantsSynced += await this.upsertOne(tenantId, connection.connectorSlug, blueprint);
    }

    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'blueprint.synced',
      entityType: 'Connection',
      entityId: connectionId,
      after: { connectorSlug: connection.connectorSlug, blueprintsSynced: adapterBlueprints.length, variantsSynced },
    });
    this.logger.log(`Synced ${adapterBlueprints.length} blueprints (${variantsSynced} variants) from ${connection.connectorSlug} for tenant ${tenantId}`);

    return { connectorSlug: connection.connectorSlug, blueprintsSynced: adapterBlueprints.length, variantsSynced };
  }

  private async upsertOne(tenantId: string, providerSlug: string, blueprint: AdapterBlueprint): Promise<number> {
    const row = await this.blueprints.upsertSeed({
      tenantId,
      providerSlug,
      providerBlueprintId: blueprint.providerBlueprintId,
      name: blueprint.name,
      category: blueprint.category,
      printAreas: blueprint.printAreas as unknown as Prisma.InputJsonValue,
      sizes: blueprint.sizes as unknown as Prisma.InputJsonValue,
      colors: blueprint.colors as unknown as Prisma.InputJsonValue,
    });
    for (const variant of blueprint.variants) {
      await this.blueprints.upsertVariant({
        blueprintId: row.id,
        tenantId,
        providerVariantId: variant.providerVariantId,
        size: variant.size,
        color: variant.color,
        ...(variant.colorHex !== undefined ? { colorHex: variant.colorHex } : {}),
        ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
        baseCostMinor: variant.baseCostMinor,
        currency: variant.currency,
      });
    }
    return blueprint.variants.length;
  }
}
