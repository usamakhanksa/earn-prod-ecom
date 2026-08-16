import { Injectable } from '@nestjs/common';
import type { DigitalFile, DigitalFileVersion, DigitalProduct, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export type DigitalProductWithFiles = DigitalProduct & { files: Array<DigitalFile & { versions: DigitalFileVersion[] }> };

/** DigitalProduct + its version-history file tree (task 5.10). */
@Injectable()
export class DigitalProductRepository extends TenantScopedRepository<Pick<PrismaService, 'digitalProduct'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.DigitalProductUncheckedCreateInput): Promise<DigitalProduct> {
    return this.prisma.digitalProduct.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<DigitalProductWithFiles | null> {
    return this.prisma.digitalProduct.findFirst({
      where: { id, tenantId },
      include: { files: { include: { versions: { orderBy: { createdAt: 'desc' } } } } },
    });
  }

  async list(tenantId: string): Promise<DigitalProductWithFiles[]> {
    return this.prisma.digitalProduct.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { files: { include: { versions: { orderBy: { createdAt: 'desc' } } } } },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.DigitalProductUpdateInput): Promise<DigitalProduct | null> {
    const existing = await this.prisma.digitalProduct.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.digitalProduct.update({ where: { id }, data });
  }

  async createFile(input: Prisma.DigitalFileUncheckedCreateInput): Promise<DigitalFile> {
    return this.prisma.digitalFile.create({ data: input });
  }

  async findFileById(tenantId: string, id: string): Promise<DigitalFile | null> {
    return this.prisma.digitalFile.findFirst({ where: { id, tenantId } });
  }

  /** Append-only version history — mirrors AssetVersion's "append, never
   * rewrite" pattern (Phase 2). Flips every sibling version's `isCurrent` to
   * false inside the same transaction as the new row's create. */
  async createVersion(
    tenantId: string,
    digitalFileId: string,
    input: Omit<Prisma.DigitalFileVersionUncheckedCreateInput, 'tenantId' | 'digitalFileId'>,
  ): Promise<DigitalFileVersion> {
    return this.prisma.$transaction(async (tx) => {
      await tx.digitalFileVersion.updateMany({ where: { tenantId, digitalFileId }, data: { isCurrent: false } });
      return tx.digitalFileVersion.create({ data: { ...input, tenantId, digitalFileId, isCurrent: true } });
    });
  }

  async findVersionById(tenantId: string, id: string): Promise<DigitalFileVersion | null> {
    return this.prisma.digitalFileVersion.findFirst({ where: { id, tenantId } });
  }

  async findCurrentVersion(tenantId: string, digitalFileId: string): Promise<DigitalFileVersion | null> {
    return this.prisma.digitalFileVersion.findFirst({ where: { tenantId, digitalFileId, isCurrent: true } });
  }

  async listVersions(tenantId: string, digitalFileId: string): Promise<DigitalFileVersion[]> {
    return this.prisma.digitalFileVersion.findMany({ where: { tenantId, digitalFileId }, orderBy: { createdAt: 'desc' } });
  }
}
