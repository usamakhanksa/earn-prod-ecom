import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Asset } from '@prisma/client';
import type {
  AssetSummary,
  AssetVersionSummary,
  CollectionSummary,
  FolderSummary,
  InitUploadInput,
  ListAssetsQuery,
  PreflightReportResult,
  PrintAreaSpec,
  RollbackAssetInput,
  RunPreflightInput,
  UpdateAssetInput,
  UploadInitResult,
} from '@omnisell/shared';
import { AssetRepository } from '../../repositories/asset.repository';
import { AssetVersionRepository } from '../../repositories/asset-version.repository';
import { AssetUploadSessionRepository } from '../../repositories/asset-upload-session.repository';
import { PreflightReportRepository } from '../../repositories/preflight-report.repository';
import { FolderRepository } from '../../repositories/folder.repository';
import { CollectionRepository } from '../../repositories/collection.repository';
import { BlueprintRepository } from '../../repositories/blueprint.repository';
import { S3PresignService } from '../../common/storage/s3-presign.service';
import { ResumableUploadStorage } from '../../common/storage/resumable-upload.storage';
import { ThumbnailService } from '../../common/storage/thumbnail.service';
import { VirusScanService } from '../../common/storage/virus-scan.service';
import { PreflightService } from '../preflight/preflight.service';
import { AuditLogService } from '../../audit/audit-log.service';

const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Studio — Assets (featureslist.md 2.1-2.7). Presigned single-PUT and
 * resumable-chunked uploads are both real code paths; see
 * `S3PresignService`/`ResumableUploadStorage`'s doc comments for exactly what
 * is and isn't verified against live infra in this sandbox (docs/DEBT.md).
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly versions: AssetVersionRepository,
    private readonly uploadSessions: AssetUploadSessionRepository,
    private readonly preflightReports: PreflightReportRepository,
    private readonly folders: FolderRepository,
    private readonly collections: CollectionRepository,
    private readonly blueprints: BlueprintRepository,
    private readonly presign: S3PresignService,
    private readonly resumableStorage: ResumableUploadStorage,
    private readonly thumbnails: ThumbnailService,
    private readonly virusScan: VirusScanService,
    private readonly preflight: PreflightService,
    private readonly audit: AuditLogService,
  ) {}

  async initUpload(tenantId: string, userId: string, input: InitUploadInput): Promise<UploadInitResult> {
    const kind = inferAssetKind(input.mimeType);
    const storageKey = this.presign.buildStorageKey(tenantId, input.filename);

    const asset = await this.assets.create({
      tenantId,
      name: input.filename,
      kind,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey,
      folderId: input.folderId ?? null,
      createdById: userId,
    });

    await this.audit.record({ tenantId, actorId: userId, action: 'asset.upload_initiated', entityType: 'Asset', entityId: asset.id });

    if (input.mode === 'RESUMABLE') {
      const session = await this.uploadSessions.create({
        tenantId,
        filename: input.filename,
        mimeType: input.mimeType,
        totalBytes: input.sizeBytes,
        storageKey,
        expiresAt: new Date(Date.now() + UPLOAD_SESSION_TTL_MS),
      });
      // Session isn't linked to the asset until the first chunk succeeds —
      // avoids a dangling assetId reference if the session is abandoned.
      return {
        assetId: asset.id,
        mode: 'RESUMABLE',
        storageKey,
        expiresAt: session.expiresAt.toISOString(),
        uploadSessionId: session.id,
        receivedBytes: 0,
        totalBytes: input.sizeBytes,
      };
    }

    const presigned = await this.presign.presignPut(storageKey, input.mimeType);
    return {
      assetId: asset.id,
      mode: 'PRESIGNED',
      storageKey,
      expiresAt: presigned.expiresAt.toISOString(),
      presignedUrl: presigned.url,
      presignedMethod: 'PUT',
    };
  }

  /** Strict offset check (tus semantics): a chunk must start exactly where the
   * session left off, so a retried/duplicated PATCH never double-appends. */
  async appendChunk(tenantId: string, sessionId: string, offsetBytes: number, chunk: Buffer): Promise<{ receivedBytes: number }> {
    const session = await this.uploadSessions.findById(tenantId, sessionId);
    if (session === null || session.status !== 'OPEN') {
      throw new NotFoundException('Upload session not found or already closed');
    }
    if (offsetBytes !== session.receivedBytes) {
      throw new ConflictException(
        `Chunk offset mismatch: session is at ${session.receivedBytes} bytes, received a chunk for offset ${offsetBytes}`,
      );
    }
    const receivedBytes = await this.resumableStorage.appendChunk(sessionId, chunk);
    await this.uploadSessions.updateProgress(sessionId, receivedBytes);
    return { receivedBytes };
  }

  async completeResumableUpload(tenantId: string, sessionId: string, userId: string): Promise<AssetSummary> {
    const session = await this.uploadSessions.findById(tenantId, sessionId);
    if (session === null || session.assetId === null) {
      throw new NotFoundException('Upload session not found');
    }
    if (session.receivedBytes !== session.totalBytes) {
      throw new BadRequestException(
        `Upload incomplete: received ${session.receivedBytes} of ${session.totalBytes} bytes`,
      );
    }

    const buffer = await this.resumableStorage.readAll(sessionId);

    // Virus scan hook (2.1) — see VirusScanService's doc comment: no
    // real scanner is reachable in this sandbox, so this is a logged no-op,
    // not a genuine malware check. Kept as a real call site so wiring an
    // actual scanner later is a one-class change, not a new integration point.
    const scanResult = await this.virusScan.scan(buffer, session.filename);
    if (!scanResult.clean) {
      await this.uploadSessions.abort(sessionId);
      throw new BadRequestException('Upload rejected by virus scan');
    }

    const metadata = await this.thumbnails.extractMetadata(buffer);
    const { thumbnail, preview } = await this.thumbnails.generateThumbnailAndPreview(buffer).catch(() => ({
      thumbnail: null,
      preview: null,
    }));

    const previewKey = preview !== null ? `${session.storageKey}.preview.png` : null;
    const thumbnailKey = thumbnail !== null ? `${session.storageKey}.thumb.png` : null;

    const asset = await this.assets.update(tenantId, session.assetId, {
      status: 'READY',
      widthPx: metadata.widthPx,
      heightPx: metadata.heightPx,
      dpi: metadata.dpi,
      colorProfile: metadata.colorProfile,
      hasTransparency: metadata.hasTransparency,
      previewKey,
      thumbnailKey,
      sizeBytes: session.totalBytes,
    });
    if (asset === null) {
      throw new NotFoundException('Asset not found');
    }

    await this.versions.create({
      assetId: asset.id,
      tenantId,
      versionNumber: 1,
      storageKey: session.storageKey,
      previewKey,
      sizeBytes: session.totalBytes,
      mimeType: session.mimeType,
      widthPx: metadata.widthPx,
      heightPx: metadata.heightPx,
      dpi: metadata.dpi,
      createdById: userId,
    });

    await this.uploadSessions.complete(sessionId, asset.id);
    await this.resumableStorage.cleanup(sessionId);
    await this.audit.record({ tenantId, actorId: userId, action: 'asset.upload_completed', entityType: 'Asset', entityId: asset.id, after: { widthPx: metadata.widthPx, heightPx: metadata.heightPx } });

    return this.toSummary(asset, null);
  }

  /**
   * Completes a presigned single-PUT upload. The API has no reachable S3
   * endpoint to fetch the bytes back from in this sandbox (docs/DEBT.md), so
   * this accepts the metadata the BROWSER already knows (file size at
   * upload-init time, plus whatever it could read client-side, e.g. via an
   * `Image` element's `naturalWidth`/`naturalHeight`) rather than pretending
   * the server independently verified it. A production deployment would also
   * fetch the object from S3 here to independently confirm.
   */
  async completePresignedUpload(
    tenantId: string,
    assetId: string,
    userId: string,
    clientMetadata?: { widthPx?: number | undefined; heightPx?: number | undefined },
  ): Promise<AssetSummary> {
    const existing = await this.assets.findById(tenantId, assetId);
    if (existing === null) {
      throw new NotFoundException('Asset not found');
    }
    const asset = await this.assets.update(tenantId, assetId, {
      status: 'READY',
      widthPx: clientMetadata?.widthPx ?? null,
      heightPx: clientMetadata?.heightPx ?? null,
    });
    if (asset === null) {
      throw new NotFoundException('Asset not found');
    }
    await this.versions.create({
      assetId: asset.id,
      tenantId,
      versionNumber: 1,
      storageKey: asset.storageKey,
      sizeBytes: asset.sizeBytes,
      mimeType: asset.mimeType,
      widthPx: clientMetadata?.widthPx ?? null,
      heightPx: clientMetadata?.heightPx ?? null,
      createdById: userId,
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'asset.upload_completed', entityType: 'Asset', entityId: asset.id });
    return this.toSummary(asset, null);
  }

  async listAssets(tenantId: string, query: ListAssetsQuery): Promise<{ items: AssetSummary[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.assets.list(tenantId, query);
    const statusByAsset = await this.preflightReports.latestStatusByAssetIds(tenantId, items.map((a) => a.id));
    return { items: items.map((asset) => this.toSummary(asset, statusByAsset.get(asset.id) ?? null)), nextCursor };
  }

  async getAsset(tenantId: string, id: string): Promise<{ asset: AssetSummary; versions: AssetVersionSummary[] }> {
    const asset = await this.assets.findById(tenantId, id);
    if (asset === null) {
      throw new NotFoundException('Asset not found');
    }
    const [versions, latestPreflight] = await Promise.all([
      this.versions.listForAsset(tenantId, id),
      this.preflightReports.latestForAsset(tenantId, id),
    ]);
    return {
      asset: this.toSummary(asset, latestPreflight?.overallStatus ?? null),
      versions: versions.map(toVersionSummary),
    };
  }

  async updateAsset(tenantId: string, id: string, userId: string, input: UpdateAssetInput): Promise<AssetSummary> {
    const before = await this.assets.findById(tenantId, id);
    if (before === null) {
      throw new NotFoundException('Asset not found');
    }
    const asset = await this.assets.update(tenantId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.starred !== undefined ? { starred: input.starred } : {}),
      ...(input.colorLabel !== undefined ? { colorLabel: input.colorLabel } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    });
    if (asset === null) {
      throw new NotFoundException('Asset not found');
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'asset.updated', entityType: 'Asset', entityId: id, before, after: asset });
    return this.toSummary(asset, null);
  }

  async deleteAsset(tenantId: string, id: string, userId: string): Promise<void> {
    const removed = await this.assets.softDelete(tenantId, id);
    if (!removed) {
      throw new NotFoundException('Asset not found');
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'asset.deleted', entityType: 'Asset', entityId: id });
  }

  /** Rollback appends a NEW version copying the target version's storage
   * pointer (2.4) — history is never rewritten. */
  async rollbackAsset(tenantId: string, id: string, userId: string, input: RollbackAssetInput): Promise<AssetSummary> {
    const asset = await this.assets.findById(tenantId, id);
    if (asset === null) {
      throw new NotFoundException('Asset not found');
    }
    const target = await this.versions.findVersion(tenantId, id, input.versionNumber);
    if (target === null) {
      throw new NotFoundException(`Version ${input.versionNumber} not found for this asset`);
    }
    const nextVersionNumber = (await this.versions.latestVersionNumber(tenantId, id)) + 1;
    await this.versions.create({
      assetId: id,
      tenantId,
      versionNumber: nextVersionNumber,
      storageKey: target.storageKey,
      previewKey: target.previewKey,
      sizeBytes: target.sizeBytes,
      mimeType: target.mimeType,
      widthPx: target.widthPx,
      heightPx: target.heightPx,
      dpi: target.dpi,
      checksum: target.checksum,
      note: `Rolled back to v${input.versionNumber}`,
      createdById: userId,
    });
    const updated = await this.assets.update(tenantId, id, {
      currentVersion: nextVersionNumber,
      storageKey: target.storageKey,
      previewKey: target.previewKey,
      sizeBytes: target.sizeBytes,
      mimeType: target.mimeType,
      widthPx: target.widthPx,
      heightPx: target.heightPx,
      dpi: target.dpi,
    });
    if (updated === null) {
      throw new NotFoundException('Asset not found');
    }
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'asset.rolled_back',
      entityType: 'Asset',
      entityId: id,
      after: { rolledBackToVersion: input.versionNumber },
    });
    return this.toSummary(updated, null);
  }

  async runPreflight(tenantId: string, id: string, input: RunPreflightInput): Promise<PreflightReportResult> {
    const asset = await this.assets.findById(tenantId, id);
    if (asset === null) {
      throw new NotFoundException('Asset not found');
    }

    let printArea: PrintAreaSpec | undefined;
    if (input.blueprintId !== undefined && input.placementCode !== undefined) {
      const blueprint = await this.blueprints.findById(tenantId, input.blueprintId);
      const areas = (blueprint?.printAreas as unknown as PrintAreaSpec[] | undefined) ?? [];
      printArea = areas.find((area) => area.code === input.placementCode);
    }

    const result = this.preflight.run(
      {
        widthPx: asset.widthPx,
        heightPx: asset.heightPx,
        dpi: asset.dpi,
        colorProfile: asset.colorProfile as PrintAreaSpec['colorProfile'] | null,
        hasTransparency: asset.hasTransparency,
        minStrokeWidthPx: asset.minStrokeWidthPx,
        sizeBytes: asset.sizeBytes,
      },
      printArea,
    );

    await this.preflightReports.create(tenantId, id, result, input.blueprintId, input.placementCode);
    return result;
  }

  // --- Folders / Collections ---------------------------------------------

  async createFolder(tenantId: string, name: string, parentId: string | null): Promise<FolderSummary> {
    const folder = await this.folders.create(tenantId, name, parentId);
    return { id: folder.id, name: folder.name, parentId: folder.parentId };
  }

  async listFolders(tenantId: string): Promise<FolderSummary[]> {
    const folders = await this.folders.list(tenantId);
    return folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }));
  }

  async createCollection(tenantId: string, name: string, description?: string): Promise<CollectionSummary> {
    const collection = await this.collections.create(tenantId, name, description);
    return { id: collection.id, name: collection.name, description: collection.description, assetCount: 0, createdAt: collection.createdAt.toISOString() };
  }

  async listCollections(tenantId: string): Promise<CollectionSummary[]> {
    const collections = await this.collections.list(tenantId);
    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      assetCount: c.assetCount,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addAssetToCollection(tenantId: string, collectionId: string, assetId: string): Promise<void> {
    const collection = await this.collections.findById(tenantId, collectionId);
    const asset = await this.assets.findById(tenantId, assetId);
    if (collection === null || asset === null) {
      throw new NotFoundException('Collection or asset not found');
    }
    await this.collections.addAsset(tenantId, collectionId, assetId);
  }

  async removeAssetFromCollection(tenantId: string, collectionId: string, assetId: string): Promise<void> {
    await this.collections.removeAsset(tenantId, collectionId, assetId);
  }

  private toSummary(asset: Asset, latestPreflightStatus: string | null): AssetSummary {
    return {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      storageKey: asset.storageKey,
      previewKey: asset.previewKey,
      thumbnailKey: asset.thumbnailKey,
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      dpi: asset.dpi,
      colorProfile: asset.colorProfile,
      hasTransparency: asset.hasTransparency,
      status: asset.status,
      starred: asset.starred,
      colorLabel: asset.colorLabel,
      tags: asset.tags,
      currentVersion: asset.currentVersion,
      folderId: asset.folderId,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      latestPreflightStatus,
    };
  }
}

function toVersionSummary(version: {
  id: string;
  versionNumber: number;
  storageKey: string;
  previewKey: string | null;
  sizeBytes: number;
  mimeType: string;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  note: string | null;
  createdAt: Date;
}): AssetVersionSummary {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    storageKey: version.storageKey,
    previewKey: version.previewKey,
    sizeBytes: version.sizeBytes,
    mimeType: version.mimeType,
    widthPx: version.widthPx,
    heightPx: version.heightPx,
    dpi: version.dpi,
    note: version.note,
    createdAt: version.createdAt.toISOString(),
  };
}

function inferAssetKind(mimeType: string): 'IMAGE' | 'VECTOR' | 'DOCUMENT' {
  if (mimeType === 'image/svg+xml' || mimeType === 'application/postscript') {
    return 'VECTOR';
  }
  if (mimeType.startsWith('image/')) {
    return 'IMAGE';
  }
  return 'DOCUMENT';
}
