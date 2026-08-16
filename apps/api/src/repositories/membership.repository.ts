import { Injectable } from '@nestjs/common';
import type { Membership } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Membership repository — every read/write forces `tenantId` from the caller's
 * request context (prompt.md constraint #4, Phase 1.5 gate).
 */
@Injectable()
export class MembershipRepository extends TenantScopedRepository<Pick<PrismaService, 'membership'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  /** Phase 5 — SLA-breach alert fan-out (`OrderExceptionService.runSlaBreachSweep`)
   * needs "who to notify" for a tenant; OWNER/ADMIN is the same conservative
   * default this codebase already uses for approval/registry decisions
   * (docs/OPEN_QUESTIONS.md #31). */
  async listOwnersAndAdmins(tenantId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({ where: { tenantId, isActive: true, role: { in: ['OWNER', 'ADMIN'] } } });
  }

  async listForTenant(tenantId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findActive(tenantId: string, userId: string): Promise<Membership | null> {
    return this.prisma.membership.findFirst({
      where: { tenantId, userId, isActive: true },
    });
  }

  async listForUser(userId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(tenantId: string, membershipId: string): Promise<Membership | null> {
    return this.prisma.membership.findFirst({ where: { id: membershipId, tenantId } });
  }

  async updateRole(tenantId: string, membershipId: string, role: string): Promise<Membership> {
    return this.prisma.membership.update({ where: { id: membershipId, tenantId }, data: { role } });
  }

  async deactivate(tenantId: string, membershipId: string): Promise<Membership> {
    return this.prisma.membership.update({ where: { id: membershipId, tenantId }, data: { isActive: false } });
  }
}
