import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { MemberSummary, TenantSummary } from '@omnisell/shared';
import { updateMemberRoleSchema } from '@omnisell/shared';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

/** Org switcher (no tenant context needed — lists everything the caller belongs to). */
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async mine(@CurrentUserId() userId: string): Promise<TenantSummary[]> {
    return this.tenants.listForUser(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<TenantSummary> {
    assertSameTenant(tenant, id);
    return this.tenants.getOne(tenant.tenantId, tenant.role);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard, TenantContextGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Membership'))
  async members(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<MemberSummary[]> {
    assertSameTenant(tenant, id);
    return this.tenants.listMembers(tenant.tenantId);
  }
}

/** `PATCH /v1/members/:id` and `DELETE /v1/members/:id` (prompt.md API surface). */
@Controller('members')
@UseGuards(JwtAuthGuard, TenantContextGuard, PoliciesGuard)
export class MembersController {
  constructor(private readonly tenants: TenantsService) {}

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', 'Membership'))
  @SkipAuditLog() // TenantsService.updateMemberRole writes a precise before/after row itself
  async updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') membershipId: string,
    @Body() body: unknown,
  ): Promise<{ updated: true }> {
    const input = updateMemberRoleSchema.parse(body);
    await this.tenants.updateMemberRole(tenant.tenantId, membershipId, input.role, tenant.userId);
    return { updated: true };
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('manage', 'Membership'))
  @SkipAuditLog() // TenantsService.removeMember writes a precise before/after row itself
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id') membershipId: string): Promise<{ removed: true }> {
    await this.tenants.removeMember(tenant.tenantId, membershipId, tenant.userId);
    return { removed: true };
  }
}

function assertSameTenant(tenant: TenantContext, routeTenantId: string): void {
  if (tenant.tenantId !== routeTenantId) {
    throw new ForbiddenException("You don't have an active session for this tenant");
  }
}
