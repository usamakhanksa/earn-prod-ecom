import { Injectable } from '@nestjs/common';
import type { FeatureFlagTarget } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Per-tenant feature-flag targeting (prompt.md Phase 1.11). `FeatureFlag` itself
 * is a global definition (no tenantId — see infra/db/rls.sql's comment) and is
 * therefore read/written directly by `FeatureFlagService`, matching how
 * `AuthService` treats other non-tenant-scoped identity tables; only the
 * per-tenant override rows go through this tenant-scoped repository.
 */
@Injectable()
export class FeatureFlagTargetRepository extends TenantScopedRepository<Pick<PrismaService, 'featureFlagTarget'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async listForTenant(tenantId: string): Promise<FeatureFlagTarget[]> {
    return this.prisma.featureFlagTarget.findMany({ where: { tenantId } });
  }

  async findOne(tenantId: string, flagId: string): Promise<FeatureFlagTarget | null> {
    return this.prisma.featureFlagTarget.findUnique({ where: { flagId_tenantId: { flagId, tenantId } } });
  }

  async upsert(tenantId: string, flagId: string, isEnabled: boolean): Promise<FeatureFlagTarget> {
    return this.prisma.featureFlagTarget.upsert({
      where: { flagId_tenantId: { flagId, tenantId } },
      update: { isEnabled },
      create: { tenantId, flagId, isEnabled },
    });
  }

  async remove(tenantId: string, flagId: string): Promise<void> {
    await this.prisma.featureFlagTarget.deleteMany({ where: { tenantId, flagId } });
  }
}
