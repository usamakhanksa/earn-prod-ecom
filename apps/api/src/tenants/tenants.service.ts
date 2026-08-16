import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MemberSummary, TenantSummary } from '@omnisell/shared';
import { TenantRepository } from '../repositories/tenant.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { UserRepository } from '../repositories/user.repository';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * Backs the web org switcher (prompt.md Phase 1.6 / featureslist.md §0.1's org
 * switcher header) and the "Members & Invites" minimal member-management screen.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditLogService,
  ) {}

  async listForUser(userId: string): Promise<TenantSummary[]> {
    const memberships = await this.memberships.listForUser(userId);
    if (memberships.length === 0) {
      return [];
    }
    const tenants = await this.tenants.findManyByIds(memberships.map((m) => m.tenantId));
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    return memberships
      .map((membership) => {
        const tenant = tenantById.get(membership.tenantId);
        if (tenant === undefined) {
          return null;
        }
        return {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          plan: tenant.plan,
          currency: tenant.currency,
          role: membership.role,
        };
      })
      .filter((summary): summary is TenantSummary => summary !== null);
  }

  async getOne(tenantId: string, callerRole: string): Promise<TenantSummary> {
    const tenant = await this.tenants.findById(tenantId);
    if (tenant === null) {
      throw new NotFoundException('Tenant not found');
    }
    return { id: tenant.id, slug: tenant.slug, name: tenant.name, plan: tenant.plan, currency: tenant.currency, role: callerRole };
  }

  async listMembers(tenantId: string): Promise<MemberSummary[]> {
    const [memberships, users] = await Promise.all([
      this.memberships.listForTenant(tenantId),
      this.users.listForTenant(tenantId),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    return memberships.map((membership) => {
      const user = userById.get(membership.userId);
      return {
        membershipId: membership.id,
        userId: membership.userId,
        email: user?.email ?? 'unknown',
        name: user?.name ?? null,
        role: membership.role,
        isActive: membership.isActive,
      };
    });
  }

  async updateMemberRole(tenantId: string, membershipId: string, role: string, actorId: string): Promise<void> {
    const membership = await this.memberships.findById(tenantId, membershipId);
    if (membership === null) {
      throw new NotFoundException('Member not found');
    }
    if (membership.userId === actorId && role !== 'OWNER') {
      throw new ForbiddenException('You cannot change your own role — ask another OWNER/ADMIN');
    }
    await this.memberships.updateRole(tenantId, membershipId, role);
    await this.audit.record({
      tenantId,
      actorId,
      action: 'member.role_updated',
      entityType: 'Membership',
      entityId: membershipId,
      before: { role: membership.role },
      after: { role },
    });
  }

  async removeMember(tenantId: string, membershipId: string, actorId: string): Promise<void> {
    const membership = await this.memberships.findById(tenantId, membershipId);
    if (membership === null) {
      throw new NotFoundException('Member not found');
    }
    if (membership.userId === actorId) {
      throw new ConflictException('You cannot remove yourself — transfer ownership first');
    }
    await this.memberships.deactivate(tenantId, membershipId);
    await this.audit.record({
      tenantId,
      actorId,
      action: 'member.removed',
      entityType: 'Membership',
      entityId: membershipId,
      before: { isActive: true },
      after: { isActive: false },
    });
  }
}
