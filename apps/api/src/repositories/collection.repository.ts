import { Injectable } from '@nestjs/common';
import type { Collection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Collections (featureslist.md 2.5) — cross-cutting, many-to-many groupings
 * (as opposed to Folder's single-parent containment). Covers both `Collection`
 * and its join table `CollectionAsset` since neither has independent meaning
 * without the other. */
@Injectable()
export class CollectionRepository extends TenantScopedRepository<Pick<PrismaService, 'collection'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(tenantId: string, name: string, description?: string): Promise<Collection> {
    return this.prisma.collection.create({ data: { tenantId, name, description: description ?? null } });
  }

  async list(tenantId: string): Promise<Array<Collection & { assetCount: number }>> {
    const collections = await this.prisma.collection.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } },
    });
    return collections.map((c) => ({ ...c, assetCount: c._count.assets }));
  }

  async findById(tenantId: string, id: string): Promise<Collection | null> {
    return this.prisma.collection.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  async addAsset(tenantId: string, collectionId: string, assetId: string): Promise<void> {
    await this.prisma.collectionAsset.upsert({
      where: { collectionId_assetId: { collectionId, assetId } },
      update: {},
      create: { collectionId, assetId, tenantId },
    });
  }

  async removeAsset(tenantId: string, collectionId: string, assetId: string): Promise<void> {
    await this.prisma.collectionAsset.deleteMany({ where: { collectionId, assetId, tenantId } });
  }
}
