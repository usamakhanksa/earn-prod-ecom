import { Injectable } from '@nestjs/common';
import type { TaxNexus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Tax Centre nexus configuration (Phase 6, task 6.7). */
@Injectable()
export class TaxNexusRepository extends TenantScopedRepository<Pick<PrismaService, 'taxNexus'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async listActive(tenantId: string): Promise<TaxNexus[]> {
    return this.prisma.taxNexus.findMany({ where: { tenantId, isActive: true }, orderBy: [{ jurisdictionType: 'asc' }, { jurisdictionCode: 'asc' }] });
  }

  async upsert(tenantId: string, input: { jurisdictionType: string; jurisdictionCode: string; registeredAt?: Date | null; thresholdMinor?: bigint | null; ratePct: number; isActive: boolean }): Promise<TaxNexus> {
    return this.prisma.taxNexus.upsert({
      where: { tenantId_jurisdictionType_jurisdictionCode: { tenantId, jurisdictionType: input.jurisdictionType, jurisdictionCode: input.jurisdictionCode } },
      create: { tenantId, ...input },
      update: input,
    });
  }
}
