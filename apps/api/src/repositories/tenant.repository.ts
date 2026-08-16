import { Injectable } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** `Tenant`'s own `id` IS the tenant boundary (mirrors `infra/db/rls.sql`'s
 * `Tenant` policy: `id = app.tenant_id()`), so every method here takes the
 * tenantId as both the row identifier and the scope guard. */
@Injectable()
export class TenantRepository extends TenantScopedRepository<Pick<PrismaService, 'tenant'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async findById(tenantId: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id: tenantId } });
  }

  async findManyByIds(tenantIds: string[]): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({ where: { id: { in: tenantIds } } });
  }

  /** Phase 6 addition (task 6.8) — sets the tenant's own KSA VAT
   * registration number, required before any ZATCA invoice can be
   * generated. */
  async updateVatNumber(tenantId: string, vatNumber: string): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { vatNumber } });
  }
}
