import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  fraudReviewDecisionSchema,
  pointAdjustSchema,
  updateTenantPointSettingsSchema,
  upsertEarningRuleSchema,
  type FraudQueueItemView,
  type TenantPointSettingsView,
} from '@omnisell/shared';
import { EarningRuleService } from './earning-rule.service';
import { TenantPointSettingsRepository } from '../repositories/tenant-point-settings.repository';
import { WalletService } from './wallet.service';
import { VideoWatchService } from './video-watch.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * Admin surfaces (docs/points-extension.md §10.3, task 4.5.8): Point Rules +
 * Settings CRUD, Fraud review queue, and the manual Point adjustment tool.
 * RBAC-gated per `AbilityFactory` (tenant OWNER/ADMIN manage everything;
 * FINANCE updates `PointEarningRule`; SUPPORT reviews the fraud queue and
 * adjusts points — matches the roles the Phase 1 scaffold already wired for
 * these exact subjects).
 */
@Controller('points')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class PointsAdminController {
  constructor(
    private readonly earningRules: EarningRuleService,
    private readonly settings: TenantPointSettingsRepository,
    private readonly wallet: WalletService,
    private readonly videoWatches: VideoWatchService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('rules')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'PointEarningRule'))
  async listRules(@CurrentTenant() tenant: TenantContext) {
    return this.earningRules.listAllForTenant(tenant.tenantId);
  }

  @Put('rules')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'PointEarningRule'))
  async upsertRule(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = upsertEarningRuleSchema.parse(body);
    const before = (await this.earningRules.listAllForTenant(tenant.tenantId)).find((r) => r.action === input.action) ?? null;
    const after = await this.earningRules.upsertRule({ tenantId: tenant.tenantId, ...input });
    await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'points.rule_upserted', entityType: 'PointEarningRule', entityId: after.id, before, after });
    return after;
  }

  @Get('settings')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'all'))
  async getSettings(@CurrentTenant() tenant: TenantContext): Promise<TenantPointSettingsView> {
    const row = await this.settings.findOrCreateDefault(tenant.tenantId);
    return toSettingsView(row);
  }

  @Put('settings')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'all'))
  async updateSettings(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<TenantPointSettingsView> {
    const input = updateTenantPointSettingsSchema.parse(body);
    const before = await this.settings.findOrCreateDefault(tenant.tenantId);
    const row = await this.settings.update(tenant.tenantId, input);
    await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'points.settings_updated', entityType: 'TenantPointSettings', entityId: row.id, before, after: row });
    return toSettingsView(row);
  }

  @Get('fraud-queue')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'VideoContent'))
  async listFraudQueue(@CurrentTenant() tenant: TenantContext): Promise<FraudQueueItemView[]> {
    return this.videoWatches.listFraudQueue(tenant.tenantId);
  }

  @Post('fraud-queue/:watchId/approve')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'PointTransaction'))
  async approveFraudSuspect(@CurrentTenant() tenant: TenantContext, @Param('watchId') watchId: string, @Body() body: unknown) {
    const input = fraudReviewDecisionSchema.parse(body);
    const result = await this.videoWatches.approveFraudSuspect(tenant.tenantId, watchId, input.note, tenant.userId);
    await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'points.fraud_approved', entityType: 'VideoWatch', entityId: watchId, after: { note: input.note } });
    return result;
  }

  @Post('fraud-queue/:watchId/reject')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'PointTransaction'))
  async rejectFraudSuspect(@CurrentTenant() tenant: TenantContext, @Param('watchId') watchId: string, @Body() body: unknown) {
    const input = fraudReviewDecisionSchema.parse(body);
    const result = await this.videoWatches.rejectFraudSuspect(tenant.tenantId, watchId, input.note, tenant.userId);
    await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'points.fraud_rejected', entityType: 'VideoWatch', entityId: watchId, after: { note: input.note } });
    return result;
  }

  @Post('adjust')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'PointTransaction'))
  async adjustPoints(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = pointAdjustSchema.parse(body);
    return this.wallet.adjustPoints({
      tenantId: tenant.tenantId,
      actorId: tenant.userId,
      targetUserId: input.userId,
      amount: input.amount,
      sign: input.sign,
      reasonCode: input.reasonCode,
      note: input.note,
    });
  }
}

function toSettingsView(row: { currencyCode: string; pointsPerCurrencyMinor: number; minRedeemPoints: number; maxRedeemSharePct: number; autoExpireDays: number | null; expiryReminderDays: number; redemptionEnabled: boolean }): TenantPointSettingsView {
  return {
    currencyCode: row.currencyCode,
    pointsPerCurrencyMinor: row.pointsPerCurrencyMinor,
    minRedeemPoints: row.minRedeemPoints,
    maxRedeemSharePct: row.maxRedeemSharePct,
    autoExpireDays: row.autoExpireDays,
    expiryReminderDays: row.expiryReminderDays,
    redemptionEnabled: row.redemptionEnabled,
  };
}
