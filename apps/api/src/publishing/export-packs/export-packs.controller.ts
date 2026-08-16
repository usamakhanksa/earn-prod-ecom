import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { confirmExportPackSchema, generateExportPackSchema } from '@omnisell/shared';
import { ExportPackGeneratorService, type ExportPackViewResult } from './export-pack-generator.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

/**
 * Export Packs (implentationplanphase.md task 4.12) — the Tier C
 * deliverable's HTTP surface: generate, download, confirm. Every mutating
 * POST is idempotency-keyed (prompt.md constraint #5).
 */
@Controller('export-packs')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ExportPacksController {
  constructor(
    private readonly exportPacks: ExportPackGeneratorService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<ExportPackViewResult[]> {
    return this.exportPacks.list(tenant.tenantId);
  }

  @Post()
  async generate(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ExportPackViewResult> {
    const input = generateExportPackSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'export_pack.generate', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 201, body: await this.exportPacks.generate(tenant.tenantId, tenant.userId, input.listingId, input.locale) }),
    );
    return result.body;
  }

  @Get(':id/download')
  async download(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const { fileName, buffer } = await this.exportPacks.download(tenant.tenantId, id, tenant.userId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post(':id/confirm')
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ExportPackViewResult> {
    const input = confirmExportPackSchema.parse(body ?? {});
    const result = await this.idempotency.run(
      { scope: 'export_pack.confirm', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: { id } },
      async () => ({ status: 200, body: await this.exportPacks.confirm(tenant.tenantId, id, tenant.userId, input.note) }),
    );
    return result.body;
  }
}
