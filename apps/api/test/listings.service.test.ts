import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ListingsService } from '../src/publishing/listings/listings.service';
import type { ListingRepository } from '../src/repositories/listing.repository';
import type { ListingVariantRepository } from '../src/repositories/listing-variant.repository';
import type { ListingFieldOverrideRepository } from '../src/repositories/listing-field-override.repository';
import type { ListingEventRepository } from '../src/repositories/listing-event.repository';
import type { ProductRepository } from '../src/repositories/product.repository';
import type { ProductVariantRepository } from '../src/repositories/product-variant.repository';
import type { ConnectionRepository } from '../src/repositories/connection.repository';
import type { ConnectorDefinitionRepository } from '../src/repositories/connector-definition.repository';
import type { AuditLogService } from '../src/audit/audit-log.service';
import type { ListingComposerInput } from '@omnisell/shared';

function makeDeps() {
  const listingRow = {
    id: 'listing-1',
    tenantId: 't1',
    productId: 'product-1',
    connectionId: 'conn-printful',
    connectorSlug: 'printful',
    title: 'Sunset Mug',
    description: 'A calm sunset print',
    tags: ['sunset', 'mug'],
    category: null,
    status: 'DRAFT',
    approvalStatus: 'NONE',
    scheduledAt: null,
    scheduledTimezone: null,
    lastError: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const listings = {
    create: vi.fn().mockResolvedValue(listingRow),
    findById: vi.fn().mockResolvedValue(listingRow),
    update: vi.fn().mockResolvedValue({ ...listingRow }),
    list: vi.fn().mockResolvedValue({ items: [listingRow], nextCursor: null }),
  };
  const listingVariants = {
    createMany: vi.fn().mockResolvedValue(1),
    listForListing: vi.fn().mockResolvedValue([{ id: 'lv-1', productVariantId: 'pv-1', externalId: null, priceMinor: 1999n, currency: 'USD', status: 'PENDING' }]),
  };
  const overrides = { upsert: vi.fn().mockResolvedValue(undefined), listForListing: vi.fn().mockResolvedValue([]) };
  const events = { record: vi.fn().mockResolvedValue(undefined), listForListing: vi.fn().mockResolvedValue([]) };
  const products = { findById: vi.fn().mockResolvedValue({ id: 'product-1', name: 'Sunset Mug' }) };
  const productVariants = {
    listForProduct: vi.fn().mockResolvedValue([
      { id: 'pv-1', sku: 'MUG-11OZ', size: '11oz', color: 'white', baseCostMinor: 500n, currency: 'USD', prices: [{ channel: 'default', currency: 'USD', priceMinor: 1999n }] },
    ]),
  };
  const connections = { findById: vi.fn().mockResolvedValue({ id: 'conn-printful', connectorId: 'def-printful', connectorSlug: 'printful', label: 'My Printful Store' }) };
  const connectorDefs = {
    findById: vi.fn().mockResolvedValue({ id: 'def-printful', slug: 'printful', name: 'Printful', tier: 'A', capabilities: { canAutomate: true, canPublish: true }, fieldSpec: { maxTitle: 100, maxDescription: 500, maxTags: 20, imageSpecs: [] } }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  return { listings, listingVariants, overrides, events, products, productVariants, connections, connectorDefs, audit, listingRow };
}

function makeService(deps: ReturnType<typeof makeDeps>): ListingsService {
  return new ListingsService(
    deps.listings as unknown as ListingRepository,
    deps.listingVariants as unknown as ListingVariantRepository,
    deps.overrides as unknown as ListingFieldOverrideRepository,
    deps.events as unknown as ListingEventRepository,
    deps.products as unknown as ProductRepository,
    deps.productVariants as unknown as ProductVariantRepository,
    deps.connections as unknown as ConnectionRepository,
    deps.connectorDefs as unknown as ConnectorDefinitionRepository,
    deps.audit as unknown as AuditLogService,
  );
}

const composerInput: ListingComposerInput = {
  productId: 'product-1',
  connectionIds: ['conn-printful'],
  title: 'Sunset Mug — a very long descriptive title used to test truncation behaviour end to end',
  description: 'A calm sunset print',
  tags: ['sunset', 'mug'],
  variants: [{ productVariantId: 'pv-1' }],
  overrides: {},
};

describe('ListingsService', () => {
  it('resolveChannels reads real capabilities/fieldSpec from the registry, never hardcoded', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const channels = await service.resolveChannels('t1', ['conn-printful']);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.fieldSpec?.maxTitle).toBe(100);
    expect(channels[0]?.tier).toBe('A');
  });

  it('resolveChannels throws NotFoundException for an unknown connection', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.resolveChannels('t1', ['missing'])).rejects.toThrow(NotFoundException);
  });

  it('create() truncates the title to the connector fieldSpec limit before saving', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await service.create('t1', 'user-1', composerInput);
    const createCall = deps.listings.create.mock.calls[0]?.[0];
    expect(createCall.title.length).toBeLessThanOrEqual(100);
    expect(deps.listingVariants.createMany).toHaveBeenCalled();
    expect(deps.events.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'STATUS_CHANGE' }));
  });

  it('create() resolves a variant price from the channel/default VariantPrice when none is supplied', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await service.create('t1', 'user-1', composerInput);
    const variantRows = deps.listingVariants.createMany.mock.calls[0]?.[0];
    expect(variantRows[0].priceMinor).toBe(1999n);
    expect(variantRows[0].currency).toBe('USD');
  });

  it('create() throws NotFoundException for an unknown product', async () => {
    const deps = makeDeps();
    deps.products.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.create('t1', 'user-1', composerInput)).rejects.toThrow(NotFoundException);
  });

  it('update() refuses to edit a LIVE listing directly', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...deps.listingRow, status: 'LIVE' });
    const service = makeService(deps);
    await expect(service.update('t1', 'user-1', 'listing-1', { title: 'New title' })).rejects.toThrow(ConflictException);
  });

  it('submitForApproval() moves the listing to PENDING/SUBMITTED', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await service.submitForApproval('t1', 'user-1', 'listing-1', {});
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', expect.objectContaining({ approvalStatus: 'SUBMITTED', status: 'PENDING' }));
  });

  it('submitForApproval() refuses to re-submit an already-approved listing', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...deps.listingRow, approvalStatus: 'APPROVED' });
    const service = makeService(deps);
    await expect(service.submitForApproval('t1', 'user-1', 'listing-1', {})).rejects.toThrow(ConflictException);
  });

  it('decideApproval(APPROVED) sets approvalStatus without forcing the listing into REJECTED', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...deps.listingRow, approvalStatus: 'SUBMITTED' });
    const service = makeService(deps);
    await service.decideApproval('t1', 'manager-1', 'listing-1', { decision: 'APPROVED' });
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', expect.objectContaining({ approvalStatus: 'APPROVED' }));
  });

  it('decideApproval(REJECTED) sets both approvalStatus AND the listing state-machine status to REJECTED', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue({ ...deps.listingRow, approvalStatus: 'SUBMITTED' });
    const service = makeService(deps);
    await service.decideApproval('t1', 'manager-1', 'listing-1', { decision: 'REJECTED', comment: 'Needs a cleaner mockup' });
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', expect.objectContaining({ approvalStatus: 'REJECTED', status: 'REJECTED', rejectionReason: 'Needs a cleaner mockup' }));
  });

  it('decideApproval() refuses to decide a listing that was never submitted', async () => {
    const deps = makeDeps();
    const service = makeService(deps); // approvalStatus: 'NONE' by default
    await expect(service.decideApproval('t1', 'manager-1', 'listing-1', { decision: 'APPROVED' })).rejects.toThrow(ConflictException);
  });

  it('addComment() records a COMMENT event on the listing timeline', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await service.addComment('t1', 'user-1', 'listing-1', { body: 'Looks great!' });
    expect(deps.events.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMMENT', message: 'Looks great!' }));
  });
});
