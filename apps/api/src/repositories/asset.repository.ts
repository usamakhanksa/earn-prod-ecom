import { Injectable } from '@nestjs/common';
import type { Asset, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';
import type { ListAssetsQuery } from '@omnisell/shared';

export interface CreateAssetInput {
  tenantId: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  folderId?: string | null;
  createdById: string;
}

/**
 * Asset repository (featureslist.md 2.1-2.7) — every read/write forced
 * through `tenantId`. Preflight-status filtering/sorting joins the most
 * recent `PreflightReport` per asset via a correlated subquery rather than
 * loading every report, since the asset library only ever needs the latest.
 */
@Injectable()
export class AssetRepository extends TenantScopedRepository<Pick<PrismaService, 'asset'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: CreateAssetInput): Promise<Asset> {
    return this.prisma.asset.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        kind: input.kind,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        folderId: input.folderId ?? null,
        createdById: input.createdById,
        status: 'UPLOADING',
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<Asset | null> {
    return this.prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  async list(tenantId: string, query: ListAssetsQuery): Promise<{ items: Asset[]; nextCursor: string | null }> {
    const where: Prisma.AssetWhereInput = { tenantId, deletedAt: null };
    if (query.folderId !== undefined) {
      where.folderId = query.folderId;
    }
    if (query.starred !== undefined) {
      where.starred = query.starred;
    }
    if (query.colorLabel !== undefined) {
      where.colorLabel = query.colorLabel;
    }
    if (query.kind !== undefined) {
      where.kind = query.kind;
    }
    if (query.tag !== undefined) {
      where.tags = { has: query.tag };
    }
    if (query.search !== undefined) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.collectionId !== undefined) {
      where.collectionLinks = { some: { collectionId: query.collectionId } };
    }

    const items = await this.prisma.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor !== undefined ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > query.limit;
    const page = hasMore ? items.slice(0, query.limit) : items;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** Returns null (not a throw) when the asset doesn't exist for this tenant —
   * the caller (AssetsService) decides whether that's a 404. */
  async update(tenantId: string, id: string, data: Prisma.AssetUpdateInput): Promise<Asset | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.asset.update({ where: { id }, data });
  }

  async softDelete(tenantId: string, id: string): Promise<boolean> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return false;
    }
    await this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    return true;
  }
}
