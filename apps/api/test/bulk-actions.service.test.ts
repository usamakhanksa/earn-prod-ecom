import { describe, expect, it, vi } from 'vitest';
import { BulkActionsService } from '../src/publishing/bulk-actions.service';
import type { ListingRepository } from '../src/repositories/listing.repository';
import type { ListingVariantRepository } from '../src/repositories/listing-variant.repository';
import type { ListingEventRepository } from '../src/repositories/listing-event.repository';
import type { ConnectorDefinitionRepository } from '../src/repositories/connector-definition.repository';
import type { ConnectionRepository } from '../src/repositories/connection.repository';
import type { AdapterRunnerService } from '../src/connections/adapter-runner.service';
import type { PublishOrchestratorService } from '../src/publishing/publish-orchestrator.service';
import type { DriftDetectionService } from '../src/publishing/drift/drift-detection.service';
import type { AuditLogService } from '../src/audit/audit-log.service';
import type { BulkListingActionInput, UndoBulkRepriceInput } from '@omnisell/shared';

function makeDeps() {
  const listingRow = { id: 'listing-1', tenantId: 't1', connectorSlug: 'redbubble', connectionId: 'conn-1', externalListingId: null, status: 'DRAFT', tags: ['old'] };
  const listings = {
    findById: vi.fn().mockResolvedValue(listingRow),
    update: vi.fn().mockResolvedValue({ ...listingRow }),
    softDelete: vi.fn().mockResolvedValue({ ...listingRow }),
  };
  const listingVariants = {
    listForListing: vi.fn().mockResolvedValue([{ id: 'lv-1', priceMinor: 1999n, currency: 'USD' }]),
    update: vi.fn().mockResolvedValue({ id: 'lv-1' }),
    updateStatusForListing: vi.fn().mockResolvedValue(1),
  };
  const listingEvents = { record: vi.fn().mockResolvedValue(undefined) };
  const connectorDefs = { findById: vi.fn().mockResolvedValue({ capabilities: { canAutomate: false, canUnpublish: false } }) };
  const connections = { findById: vi.fn().mockResolvedValue({ connectorId: 'def-1' }) };
  const adapterRunner = { run: vi.fn() };
  const orchestrator = { publishExistingListing: vi.fn().mockResolvedValue({ ok: true, error: null }) };
  const drift = { check: vi.fn().mockResolvedValue({ supported: true, hasDrift: false, diffs: [], checkedAt: 'now' }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { listings, listingVariants, listingEvents, connectorDefs, connections, adapterRunner, orchestrator, drift, audit, listingRow };
}

function makeService(deps: ReturnType<typeof makeDeps>): BulkActionsService {
  return new BulkActionsService(
    deps.listings as unknown as ListingRepository,
    deps.listingVariants as unknown as ListingVariantRepository,
    deps.listingEvents as unknown as ListingEventRepository,
    deps.connectorDefs as unknown as ConnectorDefinitionRepository,
    deps.connections as unknown as ConnectionRepository,
    deps.adapterRunner as unknown as AdapterRunnerService,
    deps.orchestrator as unknown as PublishOrchestratorService,
    deps.drift as unknown as DriftDetectionService,
    deps.audit as unknown as AuditLogService,
  );
}

describe('BulkActionsService', () => {
  it('PUBLISH delegates to the orchestrator per listing', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'PUBLISH', listingIds: ['listing-1'] } as BulkListingActionInput);
    expect(deps.orchestrator.publishExistingListing).toHaveBeenCalledWith('t1', 'user-1', 'listing-1');
    expect(result.results[0]).toMatchObject({ ok: true });
  });

  it('UNPUBLISH honestly refuses for a Tier C (non-automatable) connector', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'UNPUBLISH', listingIds: ['listing-1'] } as BulkListingActionInput);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.error).toContain('cannot be automatically unpublished');
    expect(deps.adapterRunner.run).not.toHaveBeenCalled();
  });

  it('REPRICE updates every variant and returns a real, restorable undo token', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'REPRICE', listingIds: ['listing-1'], reprice: { priceMinor: '2999', currency: 'USD' } } as BulkListingActionInput);
    expect(deps.listingVariants.update).toHaveBeenCalledWith('t1', 'lv-1', { priceMinor: 2999n, currency: 'USD' });
    expect(result.reversible).toBe(true);
    expect(result.results[0]?.undo).toEqual({ listingVariantId: 'lv-1', priceMinor: '1999', currency: 'USD' });

    // undoReprice genuinely restores the previous value.
    await service.undoReprice('t1', 'user-1', { entries: [{ listingVariantId: 'lv-1', priceMinor: '1999', currency: 'USD' }] } as UndoBulkRepriceInput);
    expect(deps.listingVariants.update).toHaveBeenCalledWith('t1', 'lv-1', { priceMinor: 1999n, currency: 'USD' });
  });

  it('RETAG in APPEND mode merges with existing tags without duplicates', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await service.run('t1', 'user-1', { action: 'RETAG', listingIds: ['listing-1'], retag: { tags: ['old', 'new'], mode: 'APPEND' } } as BulkListingActionInput);
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', { tags: ['old', 'new'] });
  });

  it('RESYNC reports drift via the real DriftDetectionService and marks the item ok:false when drift exists', async () => {
    const deps = makeDeps();
    deps.drift.check.mockResolvedValue({ supported: true, hasDrift: true, diffs: [{ field: 'title', local: 'a', remote: 'b' }], checkedAt: 'now' });
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'RESYNC', listingIds: ['listing-1'] } as BulkListingActionInput);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.error).toContain('title');
  });

  it('DELETE refuses to delete a LIVE listing', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...deps.listingRow, status: 'LIVE' });
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'DELETE', listingIds: ['listing-1'] } as BulkListingActionInput);
    expect(result.results[0]?.ok).toBe(false);
    expect(deps.listings.softDelete).not.toHaveBeenCalled();
  });

  it('DELETE soft-deletes a DRAFT listing', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'DELETE', listingIds: ['listing-1'] } as BulkListingActionInput);
    expect(deps.listings.softDelete).toHaveBeenCalledWith('t1', 'listing-1');
    expect(result.results[0]?.ok).toBe(true);
  });

  it('captures a per-listing error without aborting the whole bulk run', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockRejectedValueOnce(new Error('boom'));
    const service = makeService(deps);
    const result = await service.run('t1', 'user-1', { action: 'UNPUBLISH', listingIds: ['listing-1'] } as BulkListingActionInput);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.error).toContain('boom');
  });
});
