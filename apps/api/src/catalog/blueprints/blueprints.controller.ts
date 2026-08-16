import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { BlueprintSummary, BlueprintVariantSummary } from '@omnisell/shared';
import { BlueprintsService } from './blueprints.service';
import { BlueprintSyncService, type BlueprintSyncResult } from './blueprint-sync.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

const syncBlueprintsSchema = z.object({ connectionId: z.string().min(1) });

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class BlueprintsController {
  constructor(
    private readonly blueprints: BlueprintsService,
    private readonly sync: BlueprintSyncService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('blueprints')
  async list(@CurrentTenant() tenant: TenantContext): Promise<BlueprintSummary[]> {
    return this.blueprints.list(tenant.tenantId);
  }

  @Get('blueprints/:id')
  async getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BlueprintSummary & { variants: BlueprintVariantSummary[] }> {
    return this.blueprints.getOne(tenant.tenantId, id);
  }

  /** Real provider catalog sync (Phase 3 — replaces Phase 2's hand-seeded
   * rows, docs/CONNECTORS.md). Requires an existing CONNECTED `Connection`;
   * cannot complete against a live provider in this sandbox (no real
   * credentials) — see docs/DEBT.md. */
  @Post('blueprints/sync')
  async syncFromConnection(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BlueprintSyncResult> {
    const input = syncBlueprintsSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'blueprint.sync', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 200, body: await this.sync.syncFromConnection(tenant.tenantId, input.connectionId, tenant.userId) }),
    );
    return result.body;
  }
}
