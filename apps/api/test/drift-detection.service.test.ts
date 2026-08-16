import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const fetchListingStateMock = vi.fn();
vi.mock('@omnisell/connectors', async () => {
  const actual = await vi.importActual<typeof import('@omnisell/connectors')>('@omnisell/connectors');
  return {
    ...actual,
    getAdapter: vi.fn((slug: string) => (slug === 'printful' ? { slug: 'printful', fetchListingState: fetchListingStateMock } : undefined)),
  };
});

import { DriftDetectionService } from '../src/publishing/drift/drift-detection.service';
import type { ListingRepository } from '../src/repositories/listing.repository';
import type { ListingVariantRepository } from '../src/repositories/listing-variant.repository';
import type { ListingEventRepository } from '../src/repositories/listing-event.repository';
import type { AdapterRunnerService } from '../src/connections/adapter-runner.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

const liveListing = { id: 'listing-1', tenantId: 't1', connectorSlug: 'printful', connectionId: 'conn-1', externalListingId: 'ext-999', title: 'Sunset Mug', description: 'A calm print', tags: ['sunset', 'mug'], status: 'LIVE' };

function makeDeps() {
  const listings = { findById: vi.fn().mockResolvedValue(liveListing), update: vi.fn().mockResolvedValue(undefined) };
  const listingVariants = { listForListing: vi.fn().mockResolvedValue([{ priceMinor: 1999n, currency: 'USD' }]) };
  const listingEvents = { record: vi.fn().mockResolvedValue(undefined) };
  const adapterRunner = { run: vi.fn((_t: string, _c: string, fn: (adapter: unknown, ctx: unknown) => unknown) => fn({ fetchListingState: fetchListingStateMock }, {})) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { listings, listingVariants, listingEvents, adapterRunner, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>): DriftDetectionService {
  return new DriftDetectionService(
    deps.listings as unknown as ListingRepository,
    deps.listingVariants as unknown as ListingVariantRepository,
    deps.listingEvents as unknown as ListingEventRepository,
    deps.adapterRunner as unknown as AdapterRunnerService,
    deps.audit as unknown as AuditLogService,
  );
}

describe('DriftDetectionService', () => {
  it('returns supported:false honestly for a connector with no fetchListingState (all four real adapters, today)', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...liveListing, connectorSlug: 'gelato' });
    const service = makeService(deps);
    const result = await service.check('t1', 'listing-1');
    expect(result).toEqual({ supported: false, hasDrift: false, diffs: [], checkedAt: expect.any(String) });
  });

  it('returns supported:false when the listing has no externalListingId yet', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...liveListing, externalListingId: null });
    const service = makeService(deps);
    const result = await service.check('t1', 'listing-1');
    expect(result.supported).toBe(false);
  });

  it('detects real drift when a fake adapter (proving the comparison logic) reports a different remote title/price', async () => {
    fetchListingStateMock.mockResolvedValue({ externalId: 'ext-999', title: 'Sunset Mug (renamed on channel)', description: 'A calm print', tags: ['sunset', 'mug'], priceMinor: 2499n, currency: 'USD', status: 'LIVE' });
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.check('t1', 'listing-1');
    expect(result.supported).toBe(true);
    expect(result.hasDrift).toBe(true);
    expect(result.diffs.some((d) => d.field === 'title')).toBe(true);
    expect(result.diffs.some((d) => d.field === 'priceMinor')).toBe(true);
  });

  it('reports no drift when local and remote genuinely match', async () => {
    fetchListingStateMock.mockResolvedValue({ externalId: 'ext-999', title: 'Sunset Mug', description: 'A calm print', tags: ['sunset', 'mug'], priceMinor: 1999n, currency: 'USD', status: 'LIVE' });
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.check('t1', 'listing-1');
    expect(result.hasDrift).toBe(false);
  });

  it('resolve() overwrites local fields with the remote channel state', async () => {
    fetchListingStateMock.mockResolvedValue({ externalId: 'ext-999', title: 'Renamed on channel', description: 'desc', tags: ['a'], priceMinor: 100n, currency: 'USD', status: 'LIVE' });
    const deps = makeDeps();
    const service = makeService(deps);
    await service.resolve('t1', 'user-1', 'listing-1');
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', { title: 'Renamed on channel', description: 'desc', tags: ['a'] });
    expect(deps.listingEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'DRIFT_RESOLVED' }));
  });

  it('check() throws NotFoundException for an unknown listing', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.check('t1', 'missing')).rejects.toThrow(NotFoundException);
  });
});
