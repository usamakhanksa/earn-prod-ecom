import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { recordUsageSchema, subscribeSchema } from '@omnisell/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AuditLogService } from '../audit/audit-log.service';
import { StripeBillingService } from './billing/stripe-billing.service';
import { AiCreditService } from './billing/ai-credit.service';
import { InvoiceRepository } from '../repositories/invoice.repository';

/**
 * Billing (Phase 6, task 6.10). Route surface matches prompt.md's literal
 * list (`GET /plans`, `POST /subscription`, `POST /subscription/cancel`,
 * `GET /invoices`) plus usage/AI-credit endpoints the task's own data model
 * (`Subscription ─── UsageRecord ─── AiCreditLedger`) requires a real surface
 * for.
 */
@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class BillingController {
  constructor(
    private readonly billing: StripeBillingService,
    private readonly aiCredits: AiCreditService,
    private readonly invoices: InvoiceRepository,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('plans')
  async listPlans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Subscription'))
  async getSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.billing.getSubscription(tenant.tenantId);
  }

  @Post('subscription')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Subscription'))
  async subscribe(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = subscribeSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'billing.subscribe', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const outcome = await this.billing.subscribe(tenant.tenantId, input.planSlug);
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'billing.subscribed', entityType: 'Subscription', entityId: outcome.subscription.id, after: outcome });
        return { status: 201, body: outcome };
      },
    );
    return result.body;
  }

  @Post('subscription/cancel')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Subscription'))
  async cancelSubscription(@CurrentTenant() tenant: TenantContext, @Headers('idempotency-key') idempotencyKey?: string) {
    const result = await this.idempotency.run(
      { scope: 'billing.cancel', key: idempotencyKey, ownerId: tenant.userId, requestBody: {} },
      async () => {
        const outcome = await this.billing.cancel(tenant.tenantId);
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'billing.cancelled', entityType: 'Subscription', entityId: outcome.subscription.id, after: outcome });
        return { status: 200, body: outcome };
      },
    );
    return result.body;
  }

  @Get('invoices')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Invoice'))
  async listInvoices(@CurrentTenant() tenant: TenantContext, @Query('cursor') cursor?: string, @Query('limit') limit = '20') {
    return this.invoices.list(tenant.tenantId, cursor, Number(limit));
  }

  @Get('usage')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Subscription'))
  async listUsage(@CurrentTenant() tenant: TenantContext, @Query('kind') kind?: string) {
    return this.billing.listUsage(tenant.tenantId, kind);
  }

  @Post('usage')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Subscription'))
  async recordUsage(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = recordUsageSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'billing.usage.record', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => ({ status: 201, body: await this.billing.recordUsage(tenant.tenantId, input.kind, input.quantity) }),
    );
    return result.body;
  }

  @Get('ai/credits')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Subscription'))
  async getAiCreditBalance(@CurrentTenant() tenant: TenantContext) {
    const balance = await this.aiCredits.getBalance(tenant.tenantId);
    const history = await this.aiCredits.history(tenant.tenantId, 50);
    return { balance, history };
  }
}
