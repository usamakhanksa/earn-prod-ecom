import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConnectorFieldSpec } from '@omnisell/shared';
import type { Locale } from '@omnisell/i18n';
import { ListingRepository } from '../../repositories/listing.repository';
import { ListingVariantRepository } from '../../repositories/listing-variant.repository';
import { ListingEventRepository } from '../../repositories/listing-event.repository';
import { ProductRepository } from '../../repositories/product.repository';
import { ProductVariantRepository } from '../../repositories/product-variant.repository';
import { AssetRepository } from '../../repositories/asset.repository';
import { ConnectorDefinitionRepository } from '../../repositories/connector-definition.repository';
import { MockupRepository } from '../../repositories/mockup.repository';
import { ExportPackRepository } from '../../repositories/export-pack.repository';
import { ExportPackItemRepository } from '../../repositories/export-pack-item.repository';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { ExportPackStorage } from './export-pack.storage';
import { buildExportPack } from './export-pack-builder';
import { AuditLogService } from '../../audit/audit-log.service';

export interface ExportPackViewResult {
  id: string;
  listingId: string;
  connectionId: string;
  connectorSlug: string;
  status: string;
  locale: string;
  fileName: string;
  sizeBytes: number;
  items: Array<{ id: string; kind: string; fileName: string; sizeBytes: number }>;
  confirmedByUserId: string | null;
  confirmedByUserAt: string | null;
  createdAt: string;
}

/**
 * The Tier C deliverable's HTTP-facing half (task 4.12). Mirrors
 * `MockupsService`'s exact shape/honesty pattern (docs/DEBT.md 2-D4): fetches
 * the primary asset's real bytes via `ObjectStorageService`, which needs live
 * object storage this sandbox does not have — every call here that reaches a
 * real, previously-uploaded asset will surface an honest 503
 * `object_storage_unreachable` rather than fabricate print files. The
 * GENERATION logic itself (resize/zip/csv/checklist/field-cards, real i18n)
 * is proven independently and for real in
 * `apps/api/test/export-pack-builder.test.ts` (synthetic image bytes, real
 * `sharp` resize, real ZIP, unzip-verified) — that test is the actual proof
 * this deliverable works, not this service's unreachable-storage HTTP path.
 */
@Injectable()
export class ExportPackGeneratorService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly listingVariants: ListingVariantRepository,
    private readonly listingEvents: ListingEventRepository,
    private readonly products: ProductRepository,
    private readonly productVariants: ProductVariantRepository,
    private readonly assets: AssetRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly mockups: MockupRepository,
    private readonly exportPacks: ExportPackRepository,
    private readonly exportPackItems: ExportPackItemRepository,
    private readonly objectStorage: ObjectStorageService,
    private readonly storage: ExportPackStorage,
    private readonly audit: AuditLogService,
  ) {}

  async generate(tenantId: string, userId: string, listingId: string, locale: Locale): Promise<ExportPackViewResult> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    const product = await this.products.findById(tenantId, listing.productId);
    if (product === null || product.primaryAssetId === null) {
      throw new NotFoundException('Product or primary design asset not found');
    }
    const asset = await this.assets.findById(tenantId, product.primaryAssetId);
    if (asset === null) {
      throw new NotFoundException('Design asset not found');
    }
    const connector = await this.connectorDefs.findBySlug(listing.connectorSlug);
    const fieldSpec = (connector?.fieldSpec ?? null) as ConnectorFieldSpec | null;

    const listingVariantRows = await this.listingVariants.listForListing(tenantId, listingId);
    const productVariantById = new Map((await this.productVariants.listForProduct(tenantId, listing.productId)).map((v) => [v.id, v]));

    // Real S3 GetObject — will 503 in this sandbox (no live MinIO, docs/DEBT.md).
    const designBuffer = await this.objectStorage.getObject(asset.storageKey);

    const readyMockups = await this.mockups.listRendersForAsset(tenantId, asset.id);
    const mockupBuffers = await Promise.all(
      readyMockups
        .filter((m) => m.status === 'READY' && m.outputKey !== null)
        .map(async (m) => ({ placement: m.templateId, buffer: await this.objectStorage.getObject(m.outputKey as string) })),
    );

    const built = await buildExportPack({
      channelSlug: listing.connectorSlug,
      channelName: connector?.name ?? listing.connectorSlug,
      listingTitle: listing.title,
      effectiveTitle: listing.title,
      effectiveDescription: listing.description,
      effectiveTags: listing.tags,
      category: listing.category,
      variants: listingVariantRows.map((lv) => {
        const pv = productVariantById.get(lv.productVariantId);
        return { sku: pv?.sku ?? lv.productVariantId, size: pv?.size ?? null, color: pv?.color ?? null, priceMinor: lv.priceMinor, currency: lv.currency };
      }),
      images: [{ placement: 'default', buffer: designBuffer }],
      mockups: mockupBuffers,
      fieldSpec,
      locale,
    });

    const record = await this.exportPacks.create({
      tenantId,
      listingId,
      connectionId: listing.connectionId,
      connectorSlug: listing.connectorSlug,
      status: 'GENERATED',
      locale,
      storageKey: `export-packs/${tenantId}/${listingId}`,
      fileName: built.fileName,
      sizeBytes: built.zip.length,
      createdById: userId,
    });
    await this.storage.save(record.id, built.zip);
    await this.exportPackItems.createMany(
      built.items.map((item) => ({ tenantId, exportPackId: record.id, kind: item.kind, fileName: item.fileName, sizeBytes: item.sizeBytes })),
    );
    await this.listings.update(tenantId, listingId, { status: 'QUEUED' });
    await this.listingEvents.record({
      tenantId,
      listingId,
      type: 'EXPORT_PACK_GENERATED',
      message: `Export pack generated for ${connector?.name ?? listing.connectorSlug}`,
      actorId: userId,
      payload: { exportPackId: record.id, fileName: built.fileName },
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'export_pack.generated', entityType: 'ExportPack', entityId: record.id, after: { listingId, fileName: built.fileName } });

    return this.toView(record.id, tenantId);
  }

  async download(tenantId: string, exportPackId: string, userId: string): Promise<{ fileName: string; buffer: Buffer }> {
    const record = await this.exportPacks.findById(tenantId, exportPackId);
    if (record === null) {
      throw new NotFoundException('Export pack not found');
    }
    const buffer = await this.storage.read(exportPackId);
    if (record.status === 'GENERATED') {
      await this.exportPacks.update(tenantId, exportPackId, { status: 'DOWNLOADED' });
      await this.audit.record({ tenantId, actorId: userId, action: 'export_pack.downloaded', entityType: 'ExportPack', entityId: exportPackId });
    }
    return { fileName: record.fileName, buffer };
  }

  /** Marks the pack (and its listing) as confirmed-uploaded — the moment a
   * Tier C listing's state/analytics start behaving the same as an automated
   * channel's (README.md §4's promise). */
  async confirm(tenantId: string, exportPackId: string, userId: string, note?: string): Promise<ExportPackViewResult> {
    const record = await this.exportPacks.findById(tenantId, exportPackId);
    if (record === null) {
      throw new NotFoundException('Export pack not found');
    }
    const now = new Date();
    await this.exportPacks.update(tenantId, exportPackId, { status: 'CONFIRMED', confirmedByUserId: userId, confirmedByUserAt: now });
    await this.listings.update(tenantId, record.listingId, { status: 'LIVE' });
    await this.listingVariants.updateStatusForListing(tenantId, record.listingId, 'LIVE');
    await this.listingEvents.record({
      tenantId,
      listingId: record.listingId,
      type: 'EXPORT_PACK_CONFIRMED',
      message: note ?? 'Manual upload confirmed by user',
      actorId: userId,
      payload: { exportPackId },
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'export_pack.confirmed', entityType: 'ExportPack', entityId: exportPackId, after: { note: note ?? null } });
    return this.toView(exportPackId, tenantId);
  }

  async listForListing(tenantId: string, listingId: string): Promise<ExportPackViewResult[]> {
    const rows = await this.exportPacks.listForListing(tenantId, listingId);
    return Promise.all(rows.map((r) => this.toView(r.id, tenantId)));
  }

  async list(tenantId: string, status?: string): Promise<ExportPackViewResult[]> {
    const rows = await this.exportPacks.list(tenantId, status);
    return Promise.all(rows.map((r) => this.toView(r.id, tenantId)));
  }

  private async toView(exportPackId: string, tenantId: string): Promise<ExportPackViewResult> {
    const record = await this.exportPacks.findById(tenantId, exportPackId);
    if (record === null) {
      throw new NotFoundException('Export pack not found');
    }
    return {
      id: record.id,
      listingId: record.listingId,
      connectionId: record.connectionId,
      connectorSlug: record.connectorSlug,
      status: record.status,
      locale: record.locale,
      fileName: record.fileName,
      sizeBytes: record.sizeBytes,
      items: record.items.map((i) => ({ id: i.id, kind: i.kind, fileName: i.fileName, sizeBytes: i.sizeBytes })),
      confirmedByUserId: record.confirmedByUserId,
      confirmedByUserAt: record.confirmedByUserAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
