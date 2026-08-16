import { Injectable } from '@nestjs/common';
import type { AssetVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export interface CreateVersionInput {
  assetId: string;
  tenantId: string;
  versionNumber: number;
  storageKey: string;
  previewKey?: string | null;
  sizeBytes: number;
  mimeType: string;
  widthPx?: number | null;
  heightPx?: number | null;
  dpi?: number | null;
  checksum?: string | null;
  note?: string | null;
  createdById: string;
}

/** Asset versioning with rollback (featureslist.md 2.4) — an append-only
 * timeline; rollback creates a NEW version copying an older one's storage
 * key rather than mutating history. */
@Injectable()
export class AssetVersionRepository extends TenantScopedRepository<Pick<PrismaService, 'assetVersion'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: CreateVersionInput): Promise<AssetVersion> {
    return this.prisma.assetVersion.create({
      data: {
        assetId: input.assetId,
        tenantId: input.tenantId,
        versionNumber: input.versionNumber,
        storageKey: input.storageKey,
        previewKey: input.previewKey ?? null,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        widthPx: input.widthPx ?? null,
        heightPx: input.heightPx ?? null,
        dpi: input.dpi ?? null,
        checksum: input.checksum ?? null,
        note: input.note ?? null,
        createdById: input.createdById,
      },
    });
  }

  async listForAsset(tenantId: string, assetId: string): Promise<AssetVersion[]> {
    return this.prisma.assetVersion.findMany({
      where: { tenantId, assetId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async findVersion(tenantId: string, assetId: string, versionNumber: number): Promise<AssetVersion | null> {
    return this.prisma.assetVersion.findFirst({ where: { tenantId, assetId, versionNumber } });
  }

  async latestVersionNumber(tenantId: string, assetId: string): Promise<number> {
    const latest = await this.prisma.assetVersion.findFirst({
      where: { tenantId, assetId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return latest?.versionNumber ?? 0;
  }
}
