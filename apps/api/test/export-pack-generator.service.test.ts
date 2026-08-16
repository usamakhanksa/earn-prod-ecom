import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { ExportPackGeneratorService } from '../src/publishing/export-packs/export-pack-generator.service';
import type { ListingRepository } from '../src/repositories/listing.repository';
import type { ListingVariantRepository } from '../src/repositories/listing-variant.repository';
import type { ListingEventRepository } from '../src/repositories/listing-event.repository';
import type { ProductRepository } from '../src/repositories/product.repository';
import type { ProductVariantRepository } from '../src/repositories/product-variant.repository';
import type { AssetRepository } from '../src/repositories/asset.repository';
import type { ConnectorDefinitionRepository } from '../src/repositories/connector-definition.repository';
import type { MockupRepository } from '../src/repositories/mockup.repository';
import type { ExportPackRepository } from '../src/repositories/export-pack.repository';
import type { ExportPackItemRepository } from '../src/repositories/export-pack-item.repository';
import type { ObjectStorageService } from '../src/common/storage/object-storage.service';
import type { ExportPackStorage } from '../src/publishing/export-packs/export-pack.storage';
import type { AuditLogService } from '../src/audit/audit-log.service';

async function solidPng(): Promise<Buffer> {
  return sharp({ create: { width: 4000, height: 4000, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer();
}

function makeDeps() {
  const listing = {
    id: 'listing-1',
    tenantId: 't1',
    productId: 'product-1',
    connectionId: 'conn-1',
    connectorSlug: 'redbubble',
    title: 'Sunset Mug',
    description: 'A calm sunset',
    tags: ['sunset', 'mug'],
    category: 'DRINKWARE',
  };
  const listings = {
    findById: vi.fn().mockResolvedValue(listing),
    update: vi.fn().mockResolvedValue({ ...listing, status: 'QUEUED' }),
  };
  const listingVariants = {
    listForListing: vi.fn().mockResolvedValue([{ id: 'lv-1', productVariantId: 'pv-1', priceMinor: 1999n, currency: 'USD' }]),
    updateStatusForListing: vi.fn().mockResolvedValue(1),
  };
  const listingEvents = { record: vi.fn().mockResolvedValue(undefined) };
  const products = { findById: vi.fn().mockResolvedValue({ id: 'product-1', primaryAssetId: 'asset-1' }) };
  const productVariants = { listForProduct: vi.fn().mockResolvedValue([{ id: 'pv-1', sku: 'MUG-11OZ', size: '11oz', color: 'white' }]) };
  const assets = { findById: vi.fn().mockResolvedValue({ id: 'asset-1', storageKey: 'tenants/t1/assets/asset-1.png' }) };
  const connectorDefs = {
    findBySlug: vi.fn().mockResolvedValue({ name: 'Redbubble', fieldSpec: { maxTitle: 120, maxDescription: 1000, maxTags: 15, imageSpecs: [{ placement: 'default', minWidthPx: 3840, minHeightPx: 3840, dpiMin: 150, formats: ['png'] }] } }),
  };
  const mockups = { listRendersForAsset: vi.fn().mockResolvedValue([]) };
  const exportPackRow = {
    id: 'pack-1',
    tenantId: 't1',
    listingId: 'listing-1',
    connectionId: 'conn-1',
    connectorSlug: 'redbubble',
    status: 'GENERATED',
    locale: 'en',
    fileName: 'redbubble-2026-08-12-sunset-mug.zip',
    sizeBytes: 12345,
    confirmedByUserId: null,
    confirmedByUserAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    items: [{ id: 'item-1', kind: 'PRINT_FILE', fileName: 'print-files/default-01.png', sizeBytes: 1000 }],
  };
  const exportPacks = {
    create: vi.fn().mockResolvedValue(exportPackRow),
    findById: vi.fn().mockResolvedValue(exportPackRow),
    update: vi.fn().mockResolvedValue({ ...exportPackRow, status: 'CONFIRMED' }),
    listForListing: vi.fn().mockResolvedValue([exportPackRow]),
    list: vi.fn().mockResolvedValue([exportPackRow]),
  };
  const exportPackItems = { createMany: vi.fn().mockResolvedValue(1) };
  const objectStorage = { getObject: vi.fn() };
  const storage = { save: vi.fn().mockResolvedValue('/scratch/pack-1.zip'), read: vi.fn().mockResolvedValue(Buffer.from('zip-bytes')) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  return { listings, listingVariants, listingEvents, products, productVariants, assets, connectorDefs, mockups, exportPacks, exportPackItems, objectStorage, storage, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>): ExportPackGeneratorService {
  return new ExportPackGeneratorService(
    deps.listings as unknown as ListingRepository,
    deps.listingVariants as unknown as ListingVariantRepository,
    deps.listingEvents as unknown as ListingEventRepository,
    deps.products as unknown as ProductRepository,
    deps.productVariants as unknown as ProductVariantRepository,
    deps.assets as unknown as AssetRepository,
    deps.connectorDefs as unknown as ConnectorDefinitionRepository,
    deps.mockups as unknown as MockupRepository,
    deps.exportPacks as unknown as ExportPackRepository,
    deps.exportPackItems as unknown as ExportPackItemRepository,
    deps.objectStorage as unknown as ObjectStorageService,
    deps.storage as unknown as ExportPackStorage,
    deps.audit as unknown as AuditLogService,
  );
}

describe('ExportPackGeneratorService', () => {
  it('generates a real pack when the source asset bytes ARE reachable, saves it, and queues the listing', async () => {
    const deps = makeDeps();
    deps.objectStorage.getObject.mockResolvedValue(await solidPng());
    const service = makeService(deps);

    const result = await service.generate('t1', 'user-1', 'listing-1', 'en');

    expect(result.id).toBe('pack-1');
    expect(deps.storage.save).toHaveBeenCalledWith('pack-1', expect.any(Buffer));
    expect(deps.exportPackItems.createMany).toHaveBeenCalled();
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', { status: 'QUEUED' });
    expect(deps.listingEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPORT_PACK_GENERATED' }));
    expect(deps.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'export_pack.generated' }));
  });

  it('propagates the honest 503 when object storage is unreachable, rather than fabricating a pack', async () => {
    const deps = makeDeps();
    deps.objectStorage.getObject.mockRejectedValue(new Error('object_storage_unreachable'));
    const service = makeService(deps);

    await expect(service.generate('t1', 'user-1', 'listing-1', 'en')).rejects.toThrow('object_storage_unreachable');
    expect(deps.exportPacks.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown listing', async () => {
    const deps = makeDeps();
    deps.listings.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.generate('t1', 'user-1', 'missing', 'en')).rejects.toThrow(NotFoundException);
  });

  it('download() marks a freshly generated pack as DOWNLOADED exactly once', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.download('t1', 'pack-1', 'user-1');
    expect(result.fileName).toBe('redbubble-2026-08-12-sunset-mug.zip');
    expect(deps.exportPacks.update).toHaveBeenCalledWith('t1', 'pack-1', { status: 'DOWNLOADED' });
  });

  it('confirm() marks the pack CONFIRMED and transitions the listing + its variants to LIVE', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await service.confirm('t1', 'pack-1', 'user-1', 'Uploaded manually on 2026-08-12');
    expect(deps.exportPacks.update).toHaveBeenCalledWith('t1', 'pack-1', expect.objectContaining({ status: 'CONFIRMED', confirmedByUserId: 'user-1' }));
    expect(deps.listings.update).toHaveBeenCalledWith('t1', 'listing-1', { status: 'LIVE' });
    expect(deps.listingVariants.updateStatusForListing).toHaveBeenCalledWith('t1', 'listing-1', 'LIVE');
    expect(deps.listingEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPORT_PACK_CONFIRMED' }));
  });

  it('confirm() throws NotFoundException for an unknown pack', async () => {
    const deps = makeDeps();
    deps.exportPacks.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.confirm('t1', 'missing', 'user-1')).rejects.toThrow(NotFoundException);
  });
});
