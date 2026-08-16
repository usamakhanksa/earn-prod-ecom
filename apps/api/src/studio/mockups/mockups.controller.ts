import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { MockupRenderSummary, MockupTemplateSummary } from '@omnisell/shared';
import { composeMockupSchema } from '@omnisell/shared';
import { MockupsService } from './mockups.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { PoliciesGuard } from '../../rbac/policies.guard';
import { CheckPolicies } from '../../rbac/check-policies.decorator';

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class MockupsController {
  constructor(private readonly mockups: MockupsService) {}

  @Get('mockup-templates')
  async listTemplates(@CurrentTenant() tenant: TenantContext): Promise<MockupTemplateSummary[]> {
    return this.mockups.listTemplates(tenant.tenantId);
  }

  @Post('mockups/compose')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'MockupTemplate'))
  async compose(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<MockupRenderSummary> {
    const input = composeMockupSchema.parse(body);
    return this.mockups.compose(tenant.tenantId, tenant.userId, input.templateId, input.assetId);
  }

  @Get('assets/:assetId/mockups')
  async listForAsset(@CurrentTenant() tenant: TenantContext, @Param('assetId') assetId: string): Promise<MockupRenderSummary[]> {
    return this.mockups.listRendersForAsset(tenant.tenantId, assetId);
  }
}
