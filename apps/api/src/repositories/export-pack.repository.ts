import { Injectable } from '@nestjs/common';
import type { ExportPack, ExportPackItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ExportPackRepository extends TenantScopedRepository<Pick<PrismaService, 'exportPack'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.ExportPackUncheckedCreateInput): Promise<ExportPack> {
    return this.prisma.exportPack.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<(ExportPack & { items: ExportPackItem[] }) | null> {
    return this.prisma.exportPack.findFirst({ where: { id, tenantId }, include: { items: true } });
  }

  async listForListing(tenantId: string, listingId: string): Promise<ExportPack[]> {
    return this.prisma.exportPack.findMany({ where: { tenantId, listingId }, orderBy: { createdAt: 'desc' } });
  }

  async list(tenantId: string, status?: string): Promise<ExportPack[]> {
    return this.prisma.exportPack.findMany({
      where: { tenantId, ...(status !== undefined ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.ExportPackUpdateInput): Promise<ExportPack | null> {
    const existing = await this.prisma.exportPack.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.exportPack.update({ where: { id }, data });
  }
}
