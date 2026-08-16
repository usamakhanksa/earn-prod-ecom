import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { PlacementSummary, PlacementTemplateSummary } from '@omnisell/shared';
import { applyPlacementTemplateSchema, savePlacementTemplateSchema, upsertPlacementSchema } from '@omnisell/shared';
import { PlacementsService } from './placements.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { PoliciesGuard } from '../../rbac/policies.guard';
import { CheckPolicies } from '../../rbac/check-policies.decorator';

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class PlacementsController {
  constructor(private readonly placements: PlacementsService) {}

  @Get('products/:id/placements')
  async list(@CurrentTenant() tenant: TenantContext, @Param('id') productId: string): Promise<PlacementSummary[]> {
    return this.placements.listForProduct(tenant.tenantId, productId);
  }

  @Post('products/:id/placements')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DesignPlacement'))
  async upsert(@CurrentTenant() tenant: TenantContext, @Param('id') productId: string, @Body() body: unknown): Promise<PlacementSummary> {
    const input = upsertPlacementSchema.parse(body);
    return this.placements.upsertPlacement(tenant.tenantId, tenant.userId, productId, input);
  }

  @Delete('products/:id/placements/:placementCode')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DesignPlacement'))
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') productId: string,
    @Param('placementCode') placementCode: string,
  ): Promise<{ removed: true }> {
    await this.placements.removePlacement(tenant.tenantId, tenant.userId, productId, placementCode);
    return { removed: true };
  }

  @Post('products/:id/placements/save-template')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DesignPlacement'))
  async saveTemplate(@CurrentTenant() tenant: TenantContext, @Param('id') productId: string, @Body() body: unknown): Promise<PlacementTemplateSummary> {
    const input = savePlacementTemplateSchema.parse(body);
    return this.placements.saveTemplate(tenant.tenantId, tenant.userId, productId, input.name, input.blueprintId);
  }

  @Get('placement-templates')
  async listTemplates(@CurrentTenant() tenant: TenantContext): Promise<PlacementTemplateSummary[]> {
    return this.placements.listTemplates(tenant.tenantId);
  }

  @Post('products/:id/placements/apply-template')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DesignPlacement'))
  async applyTemplate(@CurrentTenant() tenant: TenantContext, @Param('id') productId: string, @Body() body: unknown): Promise<PlacementSummary[]> {
    const input = applyPlacementTemplateSchema.parse(body);
    return this.placements.applyTemplate(tenant.tenantId, tenant.userId, productId, input.templateId, input.assetId);
  }
}
