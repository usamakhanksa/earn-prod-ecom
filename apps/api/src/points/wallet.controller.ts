import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import {
  earnVideoWatchAliasSchema,
  redeemConfirmSchema,
  redeemPreviewSchema,
  redeemRefundSchema,
  walletTransactionsQuerySchema,
  type EarningRuleView,
  type RedeemConfirmResult,
  type RedeemPreviewResult,
  type WalletTransactionsPage,
  type WalletView,
} from '@omnisell/shared';
import { WalletService } from './wallet.service';
import { EarningRuleService } from './earning-rule.service';
import { VideoWatchService } from './video-watch.service';
import { RedemptionService } from './redemption.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';

/** Consumer wallet & redemption endpoints (docs/points-extension.md §9.1/§9.3). */
@Controller('wallet')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly earningRules: EarningRuleService,
    private readonly videoWatches: VideoWatchService,
    private readonly redemption: RedemptionService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  async getWallet(@CurrentTenant() tenant: TenantContext): Promise<WalletView> {
    return this.wallet.getWalletView(tenant.tenantId, tenant.userId);
  }

  @Get('transactions')
  async listTransactions(@CurrentTenant() tenant: TenantContext, @Query() query: unknown): Promise<WalletTransactionsPage> {
    const input = walletTransactionsQuerySchema.parse(query);
    return this.wallet.listTransactions(tenant.tenantId, tenant.userId, input);
  }

  @Get('earning-rules')
  async listEarningRules(@CurrentTenant() tenant: TenantContext): Promise<EarningRuleView[]> {
    return this.earningRules.listActiveForTenant(tenant.tenantId);
  }

  /** §9.1's authoritative-note alias — never credits an unverified `watchSeconds`;
   * see `VideoWatchService.earnViaAlias`. */
  @Post('earn/video-watch')
  async earnViaAlias(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = earnVideoWatchAliasSchema.parse(body);
    return this.videoWatches.earnViaAlias(tenant.tenantId, tenant.userId, input.videoId);
  }

  @Post('redeem')
  async redeemPreview(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<RedeemPreviewResult> {
    const input = redeemPreviewSchema.parse(body);
    return this.redemption.preview(tenant.tenantId, tenant.userId, input);
  }

  @Post('redeem/confirm')
  async redeemConfirm(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RedeemConfirmResult> {
    const input = redeemConfirmSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'wallet.redeem.confirm', key: idempotencyKey, ownerId: `${tenant.tenantId}:${tenant.userId}`, requestBody: input },
      async () => ({ status: 201, body: await this.redemption.confirm(tenant.tenantId, tenant.userId, input, idempotencyKey ?? `auto-${Date.now()}`) }),
    );
    return result.body;
  }

  /** Not in §9.3's literal endpoint list — §7.4.3 describes the REFUND
   * behaviour but Phase 5 (Orders) is what will actually trigger it on a
   * real order cancellation. Exposed here, RBAC-gated, as the real seam
   * Phase 5 calls into once that trigger exists (never mutates a validated
   * row directly — always a fresh EARN, per §3.1). */
  @Post('redeem/refund')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductPurchaseWithPoints'))
  async redeemRefund(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = redeemRefundSchema.parse(body);
    return this.redemption.refund(tenant.tenantId, input.purchaseId);
  }
}
