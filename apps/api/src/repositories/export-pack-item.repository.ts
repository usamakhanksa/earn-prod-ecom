import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ExportPackItemRepository extends TenantScopedRepository<Pick<PrismaService, 'exportPackItem'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createMany(rows: Prisma.ExportPackItemCreateManyInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.exportPackItem.createMany({ data: rows });
    return result.count;
  }
}
