import { Injectable } from '@nestjs/common';
import type { Prisma, SavedOrderView } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class SavedOrderViewRepository extends TenantScopedRepository<Pick<PrismaService, 'savedOrderView'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async list(tenantId: string, userId: string): Promise<SavedOrderView[]> {
    return this.prisma.savedOrderView.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'asc' } });
  }

  async upsert(tenantId: string, userId: string, name: string, filters: Prisma.InputJsonValue): Promise<SavedOrderView> {
    return this.prisma.savedOrderView.upsert({
      where: { tenantId_userId_name: { tenantId, userId, name } },
      update: { filters },
      create: { tenantId, userId, name, filters },
    });
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.savedOrderView.findFirst({ where: { id, tenantId, userId } });
    if (existing === null) {
      return false;
    }
    await this.prisma.savedOrderView.delete({ where: { id } });
    return true;
  }
}
