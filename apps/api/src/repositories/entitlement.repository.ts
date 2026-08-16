import { Injectable } from '@nestjs/common';
import type { Entitlement, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class EntitlementRepository extends TenantScopedRepository<Pick<PrismaService, 'entitlement'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.EntitlementUncheckedCreateInput): Promise<Entitlement> {
    return this.prisma.entitlement.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<Entitlement | null> {
    return this.prisma.entitlement.findFirst({ where: { id, tenantId } });
  }

  async findActiveByIdWithFile(tenantId: string, id: string) {
    return this.prisma.entitlement.findFirst({
      where: { id, tenantId },
      include: { digitalProduct: { include: { files: { include: { versions: true } } } } },
    });
  }

  async list(tenantId: string, filters: { userId?: string; digitalProductId?: string; orderId?: string }): Promise<Entitlement[]> {
    return this.prisma.entitlement.findMany({
      where: { tenantId, ...filters },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(tenantId: string, id: string): Promise<Entitlement | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.entitlement.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
}
