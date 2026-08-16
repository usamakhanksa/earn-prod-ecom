import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ApplyPricingRuleResult, MarginPreviewResult, PricingRuleSummary } from '@omnisell/shared';
import { applyPricingRuleSchema, createPricingRuleSchema, marginPreviewSchema, updatePricingRuleSchema } from '@omnisell/shared';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { PoliciesGuard } from '../../rbac/policies.guard';
import { CheckPolicies } from '../../rbac/check-policies.decorator';

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('pricing-rules')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'PricingRule'))
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<PricingRuleSummary> {
    const input = createPricingRuleSchema.parse(body);
    return this.pricing.create(tenant.tenantId, tenant.userId, input);
  }

  @Get('pricing-rules')
  async list(@CurrentTenant() tenant: TenantContext): Promise<PricingRuleSummary[]> {
    return this.pricing.list(tenant.tenantId);
  }

  @Patch('pricing-rules/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'PricingRule'))
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<PricingRuleSummary> {
    const input = updatePricingRuleSchema.parse(body);
    return this.pricing.update(tenant.tenantId, tenant.userId, id, input);
  }

  @Post('pricing-rules/:id/apply')
  async apply(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<ApplyPricingRuleResult> {
    const input = applyPricingRuleSchema.parse({ ...(body as Record<string, unknown>), pricingRuleId: id });
    return this.pricing.applyRule(tenant.tenantId, input);
  }

  /** Live margin preview (3.7) — pure computation, no persistence, safe to
   * call on every keystroke of the product builder's price field. */
  @Post('pricing/preview')
  preview(@Body() body: unknown): MarginPreviewResult {
    const input = marginPreviewSchema.parse(body);
    return this.pricing.preview(input);
  }
}
