import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type {
  BulkActionResult,
  DryRunResult,
  ListingDetail,
  ListingSummary,
} from '@omnisell/shared';
import {
  addListingCommentSchema,
  bulkListingActionSchema,
  decideApprovalSchema,
  dryRunListingSchema,
  listListingsQuerySchema,
  listingComposerSchema,
  publishListingSchema,
  submitForApprovalSchema,
  undoBulkRepriceSchema,
  updateListingSchema,
} from '@omnisell/shared';
import { ListingsService } from './listings.service';
import { DryRunService } from '../dry-run.service';
import { PublishOrchestratorService, type PublishOutcome } from '../publish-orchestrator.service';
import { BulkActionsService } from '../bulk-actions.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { PoliciesGuard } from '../../rbac/policies.guard';
import { CheckPolicies } from '../../rbac/check-policies.decorator';

/**
 * Publishing Pipeline — the listing composer, dry-run, publish, bulk
 * actions, and approval workflow (featureslist.md §5, implentationplanphase.md
 * tasks 4.1-4.11). Route naming with a literal `:verb` suffix
 * (`listings:publish`, `listings:dry-run`, `listings:bulk`) matches
 * prompt.md's API surface AND this codebase's own established, working
 * precedent (`products/:id/variants:bulk`, Phase 2) — a colon is only a
 * route-param marker to Express/path-to-regexp when it immediately follows a
 * `/`; here it always follows a literal path segment, so it stays a literal
 * character.
 */
@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly dryRun: DryRunService,
    private readonly orchestrator: PublishOrchestratorService,
    private readonly bulkActions: BulkActionsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('listings')
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: unknown): Promise<{ items: ListingSummary[]; nextCursor: string | null }> {
    const input = listListingsQuerySchema.parse(query);
    return this.listings.list(tenant.tenantId, input);
  }

  @Get('listings/:id')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<ListingDetail> {
    return this.listings.getDetail(tenant.tenantId, id);
  }

  @Post('listings')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Listing'))
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ListingDetail[]> {
    const input = listingComposerSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'listing.create', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 201, body: await this.listings.create(tenant.tenantId, tenant.userId, input) }),
    );
    return result.body;
  }

  @Patch('listings/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Listing'))
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<ListingDetail> {
    const input = updateListingSchema.parse(body);
    return this.listings.update(tenant.tenantId, tenant.userId, id, input);
  }

  @Post('listings:dry-run')
  async dryRunEndpoint(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('x-locale') locale?: string): Promise<DryRunResult> {
    const input = dryRunListingSchema.parse(body);
    return this.dryRun.run(tenant.tenantId, input, locale === 'ar' ? 'ar' : 'en');
  }

  @Post('listings:publish')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Listing'))
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-locale') locale?: string,
  ): Promise<PublishOutcome> {
    const input = publishListingSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'listing.publish', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 202, body: await this.orchestrator.publish(tenant.tenantId, tenant.userId, input, locale === 'ar' ? 'ar' : 'en') }),
    );
    return result.body;
  }

  @Post('listings:bulk')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Listing'))
  async bulk(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BulkActionResult> {
    const input = bulkListingActionSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'listing.bulk', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 202, body: await this.bulkActions.run(tenant.tenantId, tenant.userId, input) }),
    );
    return result.body;
  }

  @Post('listings:bulk-undo-reprice')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Listing'))
  async undoBulkReprice(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<{ restored: number }> {
    const input = undoBulkRepriceSchema.parse(body);
    return this.bulkActions.undoReprice(tenant.tenantId, tenant.userId, input);
  }

  @Post('listings/:id/retry')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Listing'))
  async retry(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-locale') locale?: string,
  ): Promise<{ ok: boolean; error: string | null }> {
    const result = await this.idempotency.run(
      { scope: 'listing.retry', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: { id } },
      async () => ({ status: 200, body: await this.orchestrator.retryListing(tenant.tenantId, tenant.userId, id, locale === 'ar' ? 'ar' : 'en') }),
    );
    return result.body;
  }

  @Post('listings/:id/submit-for-approval')
  async submitForApproval(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<ListingDetail> {
    const input = submitForApprovalSchema.parse(body ?? {});
    return this.listings.submitForApproval(tenant.tenantId, tenant.userId, id, input);
  }

  @Post('listings/:id/approval-decision')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Listing'))
  async decideApproval(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<ListingDetail> {
    const input = decideApprovalSchema.parse(body);
    return this.listings.decideApproval(tenant.tenantId, tenant.userId, id, input);
  }

  @Post('listings/:id/comments')
  async addComment(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<ListingDetail> {
    const input = addListingCommentSchema.parse(body);
    return this.listings.addComment(tenant.tenantId, tenant.userId, id, input);
  }
}
