import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { ProductDetail, ProductSummary, ProductVariantSummary } from '@omnisell/shared';
import {
  bulkToggleVariantsSchema,
  createProductSchema,
  duplicateProductSchema,
  generateVariantMatrixSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '@omnisell/shared';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { PoliciesGuard } from '../../rbac/policies.guard';
import { CheckPolicies } from '../../rbac/check-policies.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

const importCsvSchema = z.object({ csv: z.string().min(1) });

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('products')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Product'))
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ProductDetail> {
    const input = createProductSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'product.create', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 201, body: await this.products.create(tenant.tenantId, tenant.userId, input) }),
    );
    return result.body;
  }

  @Get('products')
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    const input = listProductsQuerySchema.parse(query);
    return this.products.list(tenant.tenantId, input);
  }

  @Get('products/export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  async exportCsv(@CurrentTenant() tenant: TenantContext, @Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('content-disposition', 'attachment; filename="products.csv"');
    return this.products.exportCsv(tenant.tenantId);
  }

  @Post('products/import.csv')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Product'))
  async importCsv(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = importCsvSchema.parse(body);
    return this.products.importCsv(tenant.tenantId, tenant.userId, input.csv);
  }

  @Get('products/:id')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<ProductDetail> {
    return this.products.getDetail(tenant.tenantId, id);
  }

  @Patch('products/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Product'))
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<ProductDetail> {
    const input = updateProductSchema.parse(body);
    return this.products.update(tenant.tenantId, tenant.userId, id, input);
  }

  @Post('products/:id/variants:bulk')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductVariant'))
  async generateMatrix(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProductVariantSummary[]> {
    const input = generateVariantMatrixSchema.parse(body);
    return this.products.generateVariantMatrix(tenant.tenantId, tenant.userId, id, input);
  }

  @Patch('products/:id/variants:bulk')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductVariant'))
  async bulkToggle(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<{ updated: number }> {
    const input = bulkToggleVariantsSchema.parse(body);
    return this.products.bulkToggleVariants(tenant.tenantId, tenant.userId, id, input);
  }

  @Post('products/:id/duplicate')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Product'))
  async duplicate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ProductDetail> {
    const input = duplicateProductSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'product.duplicate', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: { id, ...input } },
      async () => ({ status: 201, body: await this.products.duplicate(tenant.tenantId, tenant.userId, id, input) }),
    );
    return result.body;
  }

  @Post('products/:id/archive')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'Product'))
  async archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<ProductSummary> {
    return this.products.archive(tenant.tenantId, tenant.userId, id);
  }
}
