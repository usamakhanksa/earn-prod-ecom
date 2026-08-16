import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { InviteSummary } from '@omnisell/shared';
import { acceptInviteSchema, createInviteSchema } from '@omnisell/shared';
import { InviteService } from './invite.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

/** Every mutation here is already audited with precise before/after context
 * inside InviteService (invite.created/revoked/resent/accepted). */
@Controller('tenants/:tenantId/invites')
@UseGuards(JwtAuthGuard, TenantContextGuard, PoliciesGuard)
export class TenantInvitesController {
  constructor(
    private readonly invites: InviteService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @CheckPolicies((ability) => ability.can('invite', 'Membership'))
  @SkipAuditLog()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<InviteSummary> {
    assertSameTenant(tenant, tenantId);
    const input = createInviteSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'invite.create', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 201, body: await this.invites.create(tenant.tenantId, tenant.userId, input.email, input.role) }),
    );
    return result.body;
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Membership'))
  async list(@CurrentTenant() tenant: TenantContext, @Param('tenantId') tenantId: string): Promise<InviteSummary[]> {
    assertSameTenant(tenant, tenantId);
    return this.invites.listForTenant(tenant.tenantId);
  }

  @Post(':inviteId/revoke')
  @CheckPolicies((ability) => ability.can('invite', 'Membership'))
  @SkipAuditLog()
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param('tenantId') tenantId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<{ revoked: true }> {
    assertSameTenant(tenant, tenantId);
    await this.invites.revoke(tenant.tenantId, inviteId, tenant.userId);
    return { revoked: true };
  }

  @Post(':inviteId/resend')
  @CheckPolicies((ability) => ability.can('invite', 'Membership'))
  @SkipAuditLog()
  async resend(
    @CurrentTenant() tenant: TenantContext,
    @Param('tenantId') tenantId: string,
    @Param('inviteId') inviteId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<InviteSummary> {
    assertSameTenant(tenant, tenantId);
    const result = await this.idempotency.run(
      { scope: 'invite.resend', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: { inviteId } },
      async () => ({ status: 200, body: await this.invites.resend(tenant.tenantId, inviteId, tenant.userId) }),
    );
    return result.body;
  }
}

@Controller('invites')
export class InviteAcceptController {
  constructor(private readonly invites: InviteService) {}

  @Post('accept')
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog() // InviteService.accept writes a precise `invite.accepted` row itself
  async accept(@CurrentUserId() userId: string, @Body() body: unknown): Promise<{ tenantId: string; role: string }> {
    const input = acceptInviteSchema.parse(body);
    return this.invites.accept(input.token, userId);
  }
}

function assertSameTenant(tenant: TenantContext, routeTenantId: string): void {
  if (tenant.tenantId !== routeTenantId) {
    throw new ForbiddenException("You don't have an active session for this tenant");
  }
}
