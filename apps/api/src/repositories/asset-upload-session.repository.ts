import { Injectable } from '@nestjs/common';
import type { AssetUploadSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Resumable-upload session tracking (featureslist.md 2.2) — see
 * `ResumableUploadStorage`'s doc comment for the disk-backed-stand-in caveat. */
@Injectable()
export class AssetUploadSessionRepository extends TenantScopedRepository<Pick<PrismaService, 'assetUploadSession'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: {
    tenantId: string;
    filename: string;
    mimeType: string;
    totalBytes: number;
    storageKey: string;
    expiresAt: Date;
  }): Promise<AssetUploadSession> {
    return this.prisma.assetUploadSession.create({
      data: {
        tenantId: input.tenantId,
        filename: input.filename,
        mimeType: input.mimeType,
        totalBytes: input.totalBytes,
        storageKey: input.storageKey,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<AssetUploadSession | null> {
    return this.prisma.assetUploadSession.findFirst({ where: { id, tenantId } });
  }

  async updateProgress(id: string, receivedBytes: number): Promise<AssetUploadSession> {
    return this.prisma.assetUploadSession.update({ where: { id }, data: { receivedBytes } });
  }

  async complete(id: string, assetId: string): Promise<AssetUploadSession> {
    return this.prisma.assetUploadSession.update({ where: { id }, data: { status: 'COMPLETE', assetId } });
  }

  async abort(id: string): Promise<AssetUploadSession> {
    return this.prisma.assetUploadSession.update({ where: { id }, data: { status: 'ABORTED' } });
  }
}
