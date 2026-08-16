import { Injectable } from '@nestjs/common';
import type { TenantDataKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Exactly one row per tenant (prompt.md constraint #3 / task 3.2's per-tenant DEK). */
@Injectable()
export class TenantDataKeyRepository extends TenantScopedRepository<Pick<PrismaService, 'tenantDataKey'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async findByTenant(tenantId: string): Promise<TenantDataKey | null> {
    return this.prisma.tenantDataKey.findUnique({ where: { tenantId } });
  }

  async create(tenantId: string, wrappedDek: string, kmsKeyId: string): Promise<TenantDataKey> {
    return this.prisma.tenantDataKey.create({ data: { tenantId, wrappedDek, kmsKeyId } });
  }

  async rotate(tenantId: string, wrappedDek: string, kmsKeyId: string): Promise<TenantDataKey> {
    return this.prisma.tenantDataKey.update({ where: { tenantId }, data: { wrappedDek, kmsKeyId, rotatedAt: new Date() } });
  }
}
