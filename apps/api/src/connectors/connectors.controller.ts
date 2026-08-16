import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { ConnectorDefinitionSummary } from '@omnisell/shared';
import { connectorDefinitionInputSchema, listConnectorsQuerySchema, updateConnectorDefinitionSchema } from '@omnisell/shared';
import { z } from 'zod';
import { ConnectorsService } from './connectors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

const quarantineBodySchema = z.object({ quarantined: z.boolean() });
const verifyBodySchema = z.object({ verifiedBy: z.string().min(1).max(200) });

/**
 * Connector registry surface (prompt.md API surface: `GET /connectors`
 * "capability matrix"). Every tenant-facing route is read-only — the registry
 * itself is only ever written by a platform admin (brb.md §6's whole point:
 * "nothing ships to users without verifiedAt + live doc URL", decided
 * centrally, not per-tenant).
 */
@Controller()
export class ConnectorsController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Capability matrix data (featureslist.md 4.6 / signature moment #3).
   * Tenant-authenticated but not tenant-scoped data — every tenant sees the
   * same registry. Quarantined (Tier D `UNVERIFIED`) rows are hidden unless
   * explicitly requested, which the ordinary web UI never does. */
  @Get('connectors')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  async list(@Query() query: unknown): Promise<ConnectorDefinitionSummary[]> {
    return this.connectors.list(listConnectorsQuerySchema.parse(query));
  }

  @Get('connectors/:slug')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  async getOne(@Param('slug') slug: string): Promise<ConnectorDefinitionSummary> {
    return this.connectors.getBySlug(slug);
  }

  // --- Admin registry CRUD (featureslist.md 4.15/14.6, apps/admin) ---

  @Get('admin/connectors')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  async adminList(): Promise<ConnectorDefinitionSummary[]> {
    return this.connectors.adminListAll();
  }

  @Post('admin/connectors')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminCreate(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ConnectorDefinitionSummary> {
    const input = connectorDefinitionInputSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'connector.create', key: idempotencyKey, ownerId: userId, requestBody: input },
      async () => ({ status: 201, body: await this.connectors.adminCreate(input, userId) }),
    );
    return result.body;
  }

  @Patch('admin/connectors/:slug')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminUpdate(@CurrentUserId() userId: string, @Param('slug') slug: string, @Body() body: unknown): Promise<ConnectorDefinitionSummary> {
    const input = updateConnectorDefinitionSchema.parse(body);
    return this.connectors.adminUpdate(slug, input, userId);
  }

  @Patch('admin/connectors/:slug/quarantine')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminSetQuarantine(@CurrentUserId() userId: string, @Param('slug') slug: string, @Body() body: unknown): Promise<ConnectorDefinitionSummary> {
    const { quarantined } = quarantineBodySchema.parse(body);
    return this.connectors.adminSetQuarantine(slug, quarantined, userId);
  }

  @Patch('admin/connectors/:slug/verify')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminVerify(@CurrentUserId() userId: string, @Param('slug') slug: string, @Body() body: unknown): Promise<ConnectorDefinitionSummary> {
    const { verifiedBy } = verifyBodySchema.parse(body);
    return this.connectors.adminSetVerification(slug, verifiedBy, userId);
  }
}
