import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { DriftCheckResult } from '@omnisell/shared';
import { DriftDetectionService } from './drift-detection.service';
import { PublishOrchestratorService } from '../publish-orchestrator.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';

/** Drift detection UI actions (featureslist.md 5.12, implentationplanphase.md
 * task 4.13) — resolve (accept channel) / force-push (re-send local state). */
@Controller('listings')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class DriftController {
  constructor(
    private readonly drift: DriftDetectionService,
    private readonly orchestrator: PublishOrchestratorService,
  ) {}

  @Get(':id/drift')
  async check(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<DriftCheckResult> {
    return this.drift.check(tenant.tenantId, id);
  }

  @Post(':id/drift/resolve')
  async resolve(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ ok: true }> {
    await this.drift.resolve(tenant.tenantId, tenant.userId, id);
    return { ok: true };
  }

  @Post(':id/drift/force-push')
  async forcePush(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ ok: boolean; error: string | null }> {
    await this.drift.markForForcePush(tenant.tenantId, tenant.userId, id);
    // allowWhenLive: true — force-push's whole point is re-sending local
    // state to a channel the listing is ALREADY live on.
    return this.orchestrator.publishExistingListing(tenant.tenantId, tenant.userId, id, 'en', true);
  }
}
