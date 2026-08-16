import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  activateLicenceKeySchema,
  createCouponSchema,
  createDigitalFileSchema,
  createDigitalProductSchema,
  createFileVersionSchema,
  deactivateLicenceKeySchema,
  generateLicenceKeysSchema,
  grantEntitlementSchema,
  issueDeliverySchema,
  redeemCouponSchema,
  resendDeliverySchema,
  updateCouponSchema,
  updateDigitalProductSchema,
} from '@omnisell/shared';
import { DigitalProductService } from './digital-product.service';
import { EntitlementService } from './entitlement.service';
import { DeliveryService } from './delivery.service';
import { LicenceKeyService } from './licence-key.service';
import { CouponService } from './coupon.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';

/**
 * Digital Products — files/versions, entitlements, signed delivery URLs,
 * licence keys, and the coupon engine (featureslist.md §7, tasks 5.10/5.11).
 * Follows prompt.md's literal surface (`GET|POST /digital-products`,
 * `POST /digital-products/:id/files`, `POST /digital-products/:id/licences`,
 * `GET /entitlements`, `POST /deliveries/:id/resend`, `GET|POST /coupons`)
 * plus the real extensions this phase's tasks need.
 */
@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class DigitalController {
  constructor(
    private readonly digitalProducts: DigitalProductService,
    private readonly entitlements: EntitlementService,
    private readonly delivery: DeliveryService,
    private readonly licenceKeys: LicenceKeyService,
    private readonly coupons: CouponService,
  ) {}

  @Get('digital-products')
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.digitalProducts.list(tenant.tenantId);
  }

  @Post('digital-products')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'DigitalProduct'))
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.digitalProducts.create(tenant.tenantId, createDigitalProductSchema.parse(body));
  }

  @Get('digital-products/:id')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.digitalProducts.getDetail(tenant.tenantId, id);
  }

  @Post('digital-products/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DigitalProduct'))
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.digitalProducts.update(tenant.tenantId, id, updateDigitalProductSchema.parse(body));
  }

  @Post('digital-products/:id/files')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DigitalProduct'))
  async addFile(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.digitalProducts.addFile(tenant.tenantId, id, createDigitalFileSchema.parse(body));
  }

  @Post('digital-files/:id/versions')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DigitalProduct'))
  async addFileVersion(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.digitalProducts.addFileVersion(tenant.tenantId, id, createFileVersionSchema.parse(body));
  }

  @Post('digital-products/:id/licences')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'LicenceKey'))
  async generateLicenceKeys(@CurrentTenant() tenant: TenantContext, @Param('id') digitalProductId: string, @Body() body: unknown) {
    return this.licenceKeys.generate(tenant.tenantId, generateLicenceKeysSchema.parse({ ...(body as object), digitalProductId }));
  }

  @Get('digital-products/:id/licences')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'LicenceKey'))
  async listLicenceKeys(@CurrentTenant() tenant: TenantContext, @Param('id') digitalProductId: string) {
    return this.licenceKeys.list(tenant.tenantId, digitalProductId);
  }

  @Post('licences/:id/revoke')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'LicenceKey'))
  async revokeLicenceKey(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.licenceKeys.revoke(tenant.tenantId, id);
  }

  @Post('licences/activate')
  async activateLicenceKey(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.licenceKeys.activate(tenant.tenantId, activateLicenceKeySchema.parse(body));
  }

  @Post('licences/deactivate')
  async deactivateLicenceKey(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.licenceKeys.deactivate(tenant.tenantId, deactivateLicenceKeySchema.parse(body));
  }

  @Get('entitlements')
  async listEntitlements(@CurrentTenant() tenant: TenantContext, @Query('userId') userId?: string, @Query('digitalProductId') digitalProductId?: string, @Query('orderId') orderId?: string) {
    return this.entitlements.list(tenant.tenantId, { ...(userId !== undefined ? { userId } : {}), ...(digitalProductId !== undefined ? { digitalProductId } : {}), ...(orderId !== undefined ? { orderId } : {}) });
  }

  @Post('entitlements')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'DigitalProduct'))
  async grantEntitlement(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.entitlements.grant(tenant.tenantId, grantEntitlementSchema.parse(body));
  }

  @Post('entitlements/:id/revoke')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'DigitalProduct'))
  async revokeEntitlement(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.entitlements.revoke(tenant.tenantId, id);
  }

  @Post('entitlements/:id/deliveries')
  async issueDelivery(@CurrentTenant() tenant: TenantContext, @Param('id') entitlementId: string, @Body() body: unknown) {
    return this.delivery.issue(tenant.tenantId, entitlementId, issueDeliverySchema.parse(body));
  }

  @Post('deliveries/:id/resend')
  async resendDelivery(@CurrentTenant() tenant: TenantContext, @Param('id') entitlementId: string, @Body() body: unknown) {
    const input = resendDeliverySchema.parse(body);
    return this.delivery.resend(tenant.tenantId, entitlementId, input.digitalFileId);
  }

  @Get('entitlements/:id/delivery-log')
  async listDeliveryLog(@CurrentTenant() tenant: TenantContext, @Param('id') entitlementId: string) {
    return this.delivery.listLogs(tenant.tenantId, entitlementId);
  }

  @Get('delivery-log')
  async listAllDeliveryLog(@CurrentTenant() tenant: TenantContext, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.delivery.listAllLogs(tenant.tenantId, cursor, limit !== undefined ? Number.parseInt(limit, 10) : 50);
  }

  @Get('coupons')
  async listCoupons(@CurrentTenant() tenant: TenantContext) {
    return this.coupons.list(tenant.tenantId);
  }

  @Post('coupons')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Coupon'))
  async createCoupon(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.coupons.create(tenant.tenantId, createCouponSchema.parse(body));
  }

  @Post('coupons/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Coupon'))
  async updateCoupon(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.coupons.update(tenant.tenantId, id, updateCouponSchema.parse(body));
  }

  @Post('coupons:redeem')
  async redeemCoupon(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Query('idempotencyKey') idemQuery?: string) {
    const input = redeemCouponSchema.parse(body);
    const key = idemQuery ?? `auto-coupon-${input.code}-${Date.now()}`;
    return this.coupons.redeem(tenant.tenantId, input, key);
  }
}
