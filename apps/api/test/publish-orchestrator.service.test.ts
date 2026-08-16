import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PublishOrchestratorService } from '../src/publishing/publish-orchestrator.service';
import type { ListingsService } from '../src/publishing/listings/listings.service';
import type { ListingRepository } from '../src/repositories/listing.repository';
import type { ListingVariantRepository } from '../src/repositories/listing-variant.repository';
import type { ListingEventRepository } from '../src/repositories/listing-event.repository';
import type { SyncJobRepository } from '../src/repositories/sync-job.repository';
import type { SyncJobItemRepository } from '../src/repositories/sync-job-item.repository';
import type { PublishInputBuilderService } from '../src/publishing/publish-input-builder.service';
import type { BannedTermsService } from '../src/publishing/policy/banned-terms.service';
import type { ExportPackGeneratorService } from '../src/publishing/export-packs/export-pack-generator.service';
import type { AdapterRunnerService } from '../src/connections/adapter-runner.service';
import type { ConnectorQueueService } from '../src/queue/connector-queue.service';
import type { AuditLogService } from '../src/audit/audit-log.service';
import type { PublishListingInput } from '@omnisell/shared';

interface TestChannel {
  connectorDefinitionId: string;
  connectionId: string;
  connectorSlug: string;
  connectorName: string;
  tier: string;
  capabilities: { canAutomate: boolean; canPublish: boolean };
  fieldSpec: null;
  apiDocsUrl: string | null;
  tosUrl: string | null;
}

const printfulChannel: TestChannel = {
  connectorDefinitionId: 'def-printful',
  connectionId: 'conn-printful',
  connectorSlug: 'printful',
  connectorName: 'Printful',
  tier: 'A',
  capabilities: { canAutomate: true, canPublish: true },
  fieldSpec: null,
  apiDocsUrl: 'https://developers.printful.com/docs/',
  tosUrl: null,
};

const redbubbleChannel: TestChannel = {
  connectorDefinitionId: 'def-redbubble',
  connectionId: 'conn-redbubble',
  connectorSlug: 'redbubble',
  connectorName: 'Redbubble',
  tier: 'C',
  capabilities: { canAutomate: false, canPublish: false },
  fieldSpec: null,
  apiDocsUrl: null,
  tosUrl: 'https://www.redbubble.com/legal/terms-of-service',
};

const prodigiChannel: TestChannel = {
  connectorDefinitionId: 'def-prodigi',
  connectionId: 'conn-prodigi',
  connectorSlug: 'prodigi',
  connectorName: 'Prodigi',
  tier: 'A',
  capabilities: { canAutomate: true, canPublish: false },
  fieldSpec: null,
  apiDocsUrl: 'https://www.prodigi.com/print-api/docs/',
  tosUrl: null,
};

function makeListingRow(connectionId: string, connectorSlug: string) {
  return { id: `listing-${connectorSlug}`, tenantId: 't1', productId: 'product-1', connectionId, connectorSlug, title: 'Sunset Mug', description: 'desc', tags: [], status: 'DRAFT' };
}

function makeDeps(channels: typeof printfulChannel[]) {
  const createdListings = channels.map((c) => ({ id: `listing-${c.connectorSlug}`, connectionId: c.connectionId }));
  const listingsService = {
    resolveChannels: vi.fn().mockResolvedValue(channels),
    computeEffectiveFields: vi.fn().mockReturnValue({ title: 'Sunset Mug', description: 'desc', tags: [], category: null, warnings: [], counters: { titleLength: 10, titleMax: null, descriptionLength: 4, descriptionMax: null, tagCount: 0, tagMax: null } }),
    create: vi.fn().mockResolvedValue(createdListings),
  };
  const listingRowsById = new Map(channels.map((c) => [`listing-${c.connectorSlug}`, makeListingRow(c.connectionId, c.connectorSlug)]));
  const listings = {
    findById: vi.fn((_t: string, id: string) => Promise.resolve(listingRowsById.get(id) ?? null)),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const listingVariants = { listForListing: vi.fn().mockResolvedValue([]), updateStatusForListing: vi.fn().mockResolvedValue(0) };
  const listingEvents = { record: vi.fn().mockResolvedValue(undefined) };
  const syncJobRow = { id: 'sync-job-1' };
  const syncJobs = { create: vi.fn().mockResolvedValue(syncJobRow), recomputeCounters: vi.fn().mockResolvedValue(undefined) };
  const itemRowsBySlug = new Map(channels.map((c) => [c.connectorSlug, { id: `item-${c.connectorSlug}`, listingId: `listing-${c.connectorSlug}`, syncJobId: 'sync-job-1', queueJobId: null as string | null }]));
  const syncJobItems = {
    createMany: vi.fn().mockResolvedValue(channels.length),
    listForJob: vi.fn().mockResolvedValue([...itemRowsBySlug.values()]),
    update: vi.fn().mockResolvedValue(undefined),
    findForListing: vi.fn((_t: string, listingId: string) => Promise.resolve([...itemRowsBySlug.values()].filter((i) => i.listingId === listingId))),
  };
  const publishInputBuilder = { build: vi.fn().mockResolvedValue({ input: { listingId: 'x', externalBlueprintId: '1', title: 'a', description: 'b', tags: [], images: [], variants: [] }, warnings: [] }) };
  const bannedTerms = { lint: vi.fn().mockResolvedValue([]) };
  const exportPacks = { generate: vi.fn().mockResolvedValue({ id: 'pack-1' }) };
  const adapterRunner = { run: vi.fn() };
  const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: 'queued-job-1' }), replay: vi.fn().mockResolvedValue({ replayed: true }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  return { listingsService, listings, listingVariants, listingEvents, syncJobs, syncJobItems, publishInputBuilder, bannedTerms, exportPacks, adapterRunner, queue, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>): PublishOrchestratorService {
  return new PublishOrchestratorService(
    deps.listingsService as unknown as ListingsService,
    deps.listings as unknown as ListingRepository,
    deps.listingVariants as unknown as ListingVariantRepository,
    deps.listingEvents as unknown as ListingEventRepository,
    deps.syncJobs as unknown as SyncJobRepository,
    deps.syncJobItems as unknown as SyncJobItemRepository,
    deps.publishInputBuilder as unknown as PublishInputBuilderService,
    deps.bannedTerms as unknown as BannedTermsService,
    deps.exportPacks as unknown as ExportPackGeneratorService,
    deps.adapterRunner as unknown as AdapterRunnerService,
    deps.queue as unknown as ConnectorQueueService,
    deps.audit as unknown as AuditLogService,
  );
}

const baseInput: PublishListingInput = {
  productId: 'product-1',
  connectionIds: [],
  title: 'Sunset Mug',
  description: 'desc',
  tags: [],
  variants: [{ productVariantId: 'pv-1' }],
  overrides: {},
};

describe('PublishOrchestratorService — the Tier C boundary, exercised for real', () => {
  it('routes a Tier A channel through the queue (adapter.publish path), never through Export Pack generation', async () => {
    const deps = makeDeps([printfulChannel]);
    const service = makeService(deps);
    const outcome = await service.publish('t1', 'user-1', { ...baseInput, connectionIds: ['conn-printful'] });

    expect(deps.queue.enqueue).toHaveBeenCalledWith('printful', expect.any(String), expect.objectContaining({ kind: 'publish' }));
    expect(deps.exportPacks.generate).not.toHaveBeenCalled();
    expect(outcome.results[0]).toMatchObject({ ok: true, route: 'QUEUED_AUTOMATION' });
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-printful', { status: 'QUEUED' });
  });

  it('routes a Tier C channel (Redbubble) through Export Pack generation, NEVER through the queue or sdkPublish', async () => {
    const deps = makeDeps([redbubbleChannel]);
    const service = makeService(deps);
    const outcome = await service.publish('t1', 'user-1', { ...baseInput, connectionIds: ['conn-redbubble'] });

    expect(deps.exportPacks.generate).toHaveBeenCalledWith('t1', 'user-1', 'listing-redbubble', 'en');
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
    expect(deps.adapterRunner.run).not.toHaveBeenCalled();
    expect(outcome.results[0]).toMatchObject({ ok: true, route: 'EXPORT_PACK' });
  });

  it('marks an automatable-but-not-publishable connector (Prodigi) UNSUPPORTED — no queue call, no export pack', async () => {
    const deps = makeDeps([prodigiChannel]);
    const service = makeService(deps);
    const outcome = await service.publish('t1', 'user-1', { ...baseInput, connectionIds: ['conn-prodigi'] });

    expect(outcome.results[0]).toMatchObject({ ok: false, route: 'UNSUPPORTED' });
    expect(outcome.results[0]?.error).toContain('fulfilment-only');
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
    expect(deps.exportPacks.generate).not.toHaveBeenCalled();
  });

  it('handles a mixed multi-channel publish with PARTIAL success (one Tier A queued, one Tier C export-packed) in a single call', async () => {
    const deps = makeDeps([printfulChannel, redbubbleChannel]);
    const service = makeService(deps);
    const outcome = await service.publish('t1', 'user-1', { ...baseInput, connectionIds: ['conn-printful', 'conn-redbubble'] });

    expect(outcome.results).toHaveLength(2);
    expect(outcome.results.find((r) => r.connectorSlug === 'printful')?.route).toBe('QUEUED_AUTOMATION');
    expect(outcome.results.find((r) => r.connectorSlug === 'redbubble')?.route).toBe('EXPORT_PACK');
    expect(deps.syncJobs.recomputeCounters).toHaveBeenCalledWith('t1', 'sync-job-1');
  });

  it('captures a queue failure as a per-item error instead of throwing — partial success, not a crash', async () => {
    const deps = makeDeps([printfulChannel]);
    deps.queue.enqueue.mockRejectedValue(new Error('connection refused (no Redis in this sandbox)'));
    const service = makeService(deps);
    const outcome = await service.publish('t1', 'user-1', { ...baseInput, connectionIds: ['conn-printful'] });

    expect(outcome.results[0]).toMatchObject({ ok: false, route: 'QUEUED_AUTOMATION' });
    expect(outcome.results[0]?.error).toContain('Redis');
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-printful', expect.objectContaining({ status: 'ERROR' }));
  });

  it('hard-blocks the ENTIRE publish call on a policy violation, before any Listing is ever created', async () => {
    const deps = makeDeps([printfulChannel]);
    deps.bannedTerms.lint.mockResolvedValue([{ field: 'title', term: 'Disney', category: 'TRADEMARK', matchType: 'FUZZY', matchedText: 'Disney' }]);
    const service = makeService(deps);

    await expect(service.publish('t1', 'user-1', { ...baseInput, connectionIds: ['conn-printful'] })).rejects.toThrow(ForbiddenException);
    expect(deps.listingsService.create).not.toHaveBeenCalled();
    expect(deps.syncJobs.create).not.toHaveBeenCalled();
  });

  it('retryListing() refuses to retry a listing that is not in ERROR', async () => {
    const deps = makeDeps([printfulChannel]);
    deps.listings.findById.mockResolvedValue({ ...makeListingRow('conn-printful', 'printful'), status: 'LIVE' });
    const service = makeService(deps);
    await expect(service.retryListing('t1', 'user-1', 'listing-printful')).rejects.toThrow(ForbiddenException);
  });

  it('retryListing() replays the queued job when one already exists for the listing', async () => {
    const deps = makeDeps([printfulChannel]);
    deps.listings.findById.mockResolvedValue({ ...makeListingRow('conn-printful', 'printful'), status: 'ERROR' });
    deps.syncJobItems.findForListing.mockResolvedValue([{ id: 'item-printful', listingId: 'listing-printful', syncJobId: 'sync-job-1', queueJobId: 'queued-job-1' }]);
    const service = makeService(deps);
    const result = await service.retryListing('t1', 'user-1', 'listing-printful');
    expect(deps.queue.replay).toHaveBeenCalledWith('printful', 'queued-job-1');
    expect(result.ok).toBe(true);
  });
});
