import { Body, Controller, Delete, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type {
  ConnectionHealthView,
  ConnectionSummary,
  TestConnectionResult,
} from '@omnisell/shared';
import { createConnectionSchema, disconnectConnectionSchema, rotateCredentialSchema } from '@omnisell/shared';
import { ConnectionsService } from './connections.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';

/**
 * Channels → Connections (prompt.md API surface, featureslist.md §4).
 * The provider OAuth callback (`GET /v1/oauth/callback/:slug`) lives in
 * `ConnectorOAuthCallbackController` below — a DIFFERENT route than Phase 1's
 * user-login SSO callback (`/v1/auth/oauth/callback/:provider`), on purpose:
 * this one authorises a *connector*, not a person, and needs the caller's
 * tenant context, which the SSO callback never has.
 */
@Controller('connections')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<ConnectionSummary[]> {
    return this.connections.list(tenant.tenantId);
  }

  @Post()
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Connection'))
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ConnectionSummary> {
    const input = createConnectionSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'connection.create', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 201, body: await this.connections.create(tenant.tenantId, tenant.userId, input) }),
    );
    return result.body;
  }

  @Get(':id/oauth/start')
  async oauthStart(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ authUrl: string }> {
    return this.connections.startOAuth(tenant.tenantId, id);
  }

  @Post(':id/test')
  async test(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<TestConnectionResult> {
    return this.connections.test(tenant.tenantId, id, tenant.userId);
  }

  @Get(':id/health')
  async health(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<ConnectionHealthView> {
    return this.connections.health(tenant.tenantId, id);
  }

  @Post(':id/rotate')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Credential'))
  async rotate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ConnectionSummary> {
    const input = rotateCredentialSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'connection.rotate', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: { id, kindHint: input.value.length } },
      async () => ({ status: 200, body: await this.connections.rotateCredential(tenant.tenantId, id, tenant.userId, input) }),
    );
    return result.body;
  }

  @Delete(':id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'Connection'))
  async disconnect(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<{ ok: true }> {
    const input = disconnectConnectionSchema.parse(body ?? {});
    await this.connections.disconnect(tenant.tenantId, id, tenant.userId, input);
    return { ok: true };
  }
}
