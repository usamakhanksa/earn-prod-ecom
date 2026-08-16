import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintSyncService } from '../src/catalog/blueprints/blueprint-sync.service';
import type { BlueprintRepository } from '../src/repositories/blueprint.repository';
import type { ConnectionRepository } from '../src/repositories/connection.repository';
import type { AdapterRunnerService } from '../src/connections/adapter-runner.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

function makeDeps() {
  const blueprints = { upsertSeed: vi.fn(), upsertVariant: vi.fn() };
  const connections = { findById: vi.fn() };
  const runner = { run: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { blueprints, connections, runner, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>): BlueprintSyncService {
  return new BlueprintSyncService(
    deps.blueprints as unknown as BlueprintRepository,
    deps.connections as unknown as ConnectionRepository,
    deps.runner as unknown as AdapterRunnerService,
    deps.audit as unknown as AuditLogService,
  );
}

describe('BlueprintSyncService.syncFromConnection', () => {
  it('404s for an unknown connection', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.syncFromConnection('t1', 'missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts every fetched blueprint + variant into the SAME tables Phase 2 hand-seeded', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorSlug: 'printful' });
    deps.runner.run.mockImplementation(async (_tenantId: string, _connId: string, fn: (adapter: unknown, ctx: unknown) => unknown) => {
      // Exercises the real guard inside syncFromConnection (adapter.fetchBlueprints must exist)
      // by supplying a fake adapter shaped like a real ConnectorAdapter.
      const fakeAdapter = {
        fetchBlueprints: async () => [
          {
            providerBlueprintId: 'bp-71',
            name: 'Unisex T-Shirt',
            category: 'T-SHIRT',
            printAreas: [],
            sizes: ['S', 'M'],
            colors: [{ name: 'Black', hex: '#000000' }],
            variants: [
              { providerVariantId: 'v-1', size: 'S', color: 'Black', colorHex: '#000000', baseCostMinor: 1095n, currency: 'USD', inStock: true },
              { providerVariantId: 'v-2', size: 'M', color: 'Black', colorHex: '#000000', baseCostMinor: 1095n, currency: 'USD', inStock: true },
            ],
          },
        ],
      };
      return fn(fakeAdapter, {});
    });
    deps.blueprints.upsertSeed.mockResolvedValue({ id: 'blueprint-row-1' });

    const service = makeService(deps);
    const result = await service.syncFromConnection('t1', 'conn-1', 'u1');

    expect(result).toEqual({ connectorSlug: 'printful', blueprintsSynced: 1, variantsSynced: 2 });
    expect(deps.blueprints.upsertSeed).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', providerSlug: 'printful', providerBlueprintId: 'bp-71', name: 'Unisex T-Shirt' }),
    );
    expect(deps.blueprints.upsertVariant).toHaveBeenCalledTimes(2);
    expect(deps.blueprints.upsertVariant).toHaveBeenCalledWith(
      expect.objectContaining({ blueprintId: 'blueprint-row-1', providerVariantId: 'v-1', baseCostMinor: 1095n }),
    );
    expect(deps.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'blueprint.synced' }));
  });

  it('propagates a BadRequestException when the adapter has no fetchBlueprints (e.g. a hypothetical catalog-less connector)', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorSlug: 'prodigi' });
    deps.runner.run.mockImplementation(async (_tenantId: string, _connId: string, fn: (adapter: unknown, ctx: unknown) => unknown) => fn({}, {}));
    const service = makeService(deps);
    await expect(service.syncFromConnection('t1', 'conn-1', 'u1')).rejects.toThrow(/does not support catalog sync/);
  });
});
