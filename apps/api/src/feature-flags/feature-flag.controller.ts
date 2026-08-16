import { Body, Controller, Delete, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { FeatureFlag } from '@prisma/client';
import type { FeatureFlagSummary } from '@omnisell/shared';
import { createFeatureFlagSchema, setFeatureFlagTargetSchema, updateFeatureFlagSchema } from '@omnisell/shared';
import { FeatureFlagService } from './feature-flag.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';
import { CurrentUserId } from '../auth/current-user.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { AdminService } from '../admin/admin.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

// Every mutation below is already audited with a real before/after diff inside
// FeatureFlagService (feature_flag.created/updated, feature_flag_target.set/removed)
// — @SkipAuditLog() prevents the generic interceptor from writing a second, less
// precise row for the same request.

@Controller()
export class FeatureFlagController {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly admin: AdminService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Tenant-scoped read — every registered flag, resolved for the caller's tenant. */
  @Get('feature-flags')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  async list(@CurrentTenant() tenant: TenantContext): Promise<FeatureFlagSummary[]> {
    return this.flags.listEffectiveForTenant(tenant.tenantId);
  }

  /** Platform-admin read — every flag definition, global. Backs the `/admin`
   * Feature Flags & Config screen (featureslist.md §0.2). Registered before
   * the tenant-scoped list on purpose so the intent (admin vs tenant surface)
   * is unambiguous even though Nest's routing wouldn't actually collide here. */
  @Get('feature-flags/definitions')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  async listDefinitions(): Promise<FeatureFlag[]> {
    return this.flags.listAllDefinitions();
  }

  @Post('feature-flags')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async create(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FeatureFlagSummary> {
    const input = createFeatureFlagSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'feature-flag.create', key: idempotencyKey, ownerId: userId, requestBody: input },
      async () => ({ status: 201, body: await this.flags.create(input, userId) }),
    );
    return result.body;
  }

  @Put('feature-flags/:key')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async update(@CurrentUserId() userId: string, @Param('key') key: string, @Body() body: unknown): Promise<FeatureFlagSummary> {
    const input = updateFeatureFlagSchema.parse(body);
    return this.flags.update(key, input, userId);
  }

  /** Per-tenant targeting — a tenant OWNER/ADMIN may only target their own tenant;
   * a platform admin may target any tenant (`FeatureFlagService.assertCanTarget`). */
  @Put('feature-flags/:key/tenants/:tenantId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'FeatureFlagTarget'))
  @SkipAuditLog()
  async setTarget(
    @CurrentTenant() caller: TenantContext,
    @Param('key') key: string,
    @Param('tenantId') targetTenantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ set: true }> {
    const input = setFeatureFlagTargetSchema.parse(body);
    const isPlatformAdmin = await this.admin.isPlatformAdmin(caller.userId);
    await this.idempotency.run(
      { scope: 'feature-flag.set-target', key: idempotencyKey, ownerId: caller.tenantId, requestBody: { key, targetTenantId, ...input } },
      async () => {
        await this.flags.setTarget(key, targetTenantId, input.isEnabled, {
          userId: caller.userId,
          tenantId: caller.tenantId,
          isPlatformAdmin,
        });
        return { status: 200, body: { set: true as const } };
      },
    );
    return { set: true };
  }

  @Delete('feature-flags/:key/tenants/:tenantId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'FeatureFlagTarget'))
  @SkipAuditLog()
  async removeTarget(
    @CurrentTenant() caller: TenantContext,
    @Param('key') key: string,
    @Param('tenantId') targetTenantId: string,
  ): Promise<{ removed: true }> {
    const isPlatformAdmin = await this.admin.isPlatformAdmin(caller.userId);
    await this.flags.removeTarget(key, targetTenantId, {
      userId: caller.userId,
      tenantId: caller.tenantId,
      isPlatformAdmin,
    });
    return { removed: true };
  }
}
