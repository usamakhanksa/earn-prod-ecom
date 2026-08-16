import { Injectable } from '@nestjs/common';
import type { Folder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class FolderRepository extends TenantScopedRepository<Pick<PrismaService, 'folder'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(tenantId: string, name: string, parentId: string | null): Promise<Folder> {
    return this.prisma.folder.create({ data: { tenantId, name, parentId } });
  }

  async list(tenantId: string): Promise<Folder[]> {
    return this.prisma.folder.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async findById(tenantId: string, id: string): Promise<Folder | null> {
    return this.prisma.folder.findFirst({ where: { id, tenantId, deletedAt: null } });
  }
}
