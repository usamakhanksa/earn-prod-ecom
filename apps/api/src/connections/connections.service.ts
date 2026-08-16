import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getAdapter } from '@omnisell/connectors';
import type {
  ConnectionHealthView,
  ConnectionSummary,
  CreateConnectionInput,
  DisconnectConnectionInput,
  RotateCredentialInput,
  TestConnectionResult,
} from '@omnisell/shared';
import { ConnectionRepository } from '../repositories/connection.repository';
import { CredentialRepository } from '../repositories/credential.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { ConnectorOAuthStateRepository } from '../repositories/connector-oauth-state.repository';
import { ConnectionHealthSampleRepository } from '../repositories/connection-health-sample.repository';
import { CredentialVaultService } from '../vault/credential-vault.service';
import { AdapterRunnerService } from './adapter-runner.service';
import { AuditLogService } from '../audit/audit-log.service';
import { env } from '../config/env';

/**
 * Connections (prompt.md Phase 3 tasks 3.2/3.3/3.9 — the connection wizard's
 * backend). Two creation paths per api-registration.md §1:
 *  - API_KEY/PAT: `create()` encrypts the pasted secret and tests it inline.
 *  - OAUTH2/OAUTH2_PKCE: `create()` makes a PENDING row with no credential;
 *    `startOAuth()`/`handleOAuthCallback()` carry the handshake.
 */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly connections: ConnectionRepository,
    private readonly credentials: CredentialRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly oauthStates: ConnectorOAuthStateRepository,
    private readonly healthSamples: ConnectionHealthSampleRepository,
    private readonly vault: CredentialVaultService,
    private readonly runner: AdapterRunnerService,
    private readonly audit: AuditLogService,
  ) {}

  async list(tenantId: string): Promise<ConnectionSummary[]> {
    const rows = await this.connections.list(tenantId);
    const summaries: ConnectionSummary[] = [];
    for (const row of rows) {
      const credential = await this.credentials.findActiveForConnection(tenantId, row.id);
      summaries.push(toSummary(row, credential));
    }
    return summaries;
  }

  async create(tenantId: string, userId: string, input: CreateConnectionInput): Promise<ConnectionSummary> {
    const definition = await this.connectorDefs.findBySlug(input.connectorSlug);
    if (definition === null) {
      throw new NotFoundException(`Connector "${input.connectorSlug}" is not registered`);
    }
    const capabilities = definition.capabilities as { canAutomate: boolean };
    if (capabilities.canAutomate !== true) {
      // brb.md §6's hard rule, enforced at the FIRST possible moment: a Tier
      // C/D connector never even gets a Connection row — the UI routes those
      // straight to the Export Pack path (Phase 4) instead.
      throw new ForbiddenException(
        `"${definition.name}" is Tier ${definition.tier} — no write API exists. Use the Export Pack flow instead of a connection.`,
      );
    }
    const adapter = getAdapter(input.connectorSlug);
    if (adapter === undefined) {
      throw new BadRequestException(`No adapter implementation exists yet for "${input.connectorSlug}"`);
    }

    const connection = await this.connections.create({
      tenantId,
      connectorId: definition.id,
      connectorSlug: definition.slug,
      label: input.label,
      authType: definition.authType,
      sandbox: input.sandbox,
      status: 'PENDING',
      createdById: userId,
    });

    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'connection.created',
      entityType: 'Connection',
      entityId: connection.id,
      after: { connectorSlug: definition.slug, label: input.label, sandbox: input.sandbox },
    });

    if (definition.authType === 'OAUTH2' || definition.authType === 'OAUTH2_PKCE') {
      // No secret to store yet — the wizard's next step is startOAuth().
      return toSummary(connection, null);
    }

    if (input.credential === undefined) {
      throw new BadRequestException(`Connector "${input.connectorSlug}" requires a credential (API key/PAT) at creation time`);
    }

    await this.saveCredential(tenantId, connection.id, input.credential.value, input.credential.secondaryValue, input.credential.kind);
    const tested = await this.testInternal(tenantId, connection.id, userId);
    return tested;
  }

  async startOAuth(tenantId: string, connectionId: string): Promise<{ authUrl: string }> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }
    const adapter = getAdapter(connection.connectorSlug);
    if (adapter?.buildAuthUrl === undefined) {
      throw new BadRequestException(`Connector "${connection.connectorSlug}" does not support OAuth`);
    }
    const state = randomUUID();
    const codeVerifier = randomBytes(32).toString('base64url'); // PKCE code_verifier
    const redirectUri = `${env.API_URL}/v1/oauth/callback/${connection.connectorSlug}`;
    const expiresAt = new Date(Date.now() + env.CONNECTOR_OAUTH_STATE_TTL_MINUTES * 60_000);

    await this.oauthStates.create({ tenantId, connectionId, connectorSlug: connection.connectorSlug, state, codeVerifier, redirectUri, expiresAt });

    const authUrl = adapter.buildAuthUrl({ tenantId, connectionId, redirectUri, state, codeVerifier });
    return { authUrl };
  }

  /** Consumes the PKCE state (single-use — a replayed callback fails),
   * validates the callback-allowlist (the connector slug the state was
   * issued for must match the one in the callback URL — implentationplanphase.md
   * task 3.3's "callback allowlist"), exchanges the code, and stores the
   * resulting token set as a fresh, encrypted Credential. */
  async handleOAuthCallback(connectorSlug: string, code: string | undefined, state: string, oauthError: string | undefined): Promise<ConnectionSummary> {
    const stateRow = await this.oauthStates.consume(state);
    if (stateRow === null) {
      throw new BadRequestException('OAuth state is invalid, expired, or was already used');
    }
    if (stateRow.connectorSlug !== connectorSlug) {
      // Callback allowlist: a state minted for connector A must never be
      // redeemable against connector B's callback route.
      throw new ForbiddenException('OAuth state does not match this connector');
    }
    if (oauthError !== undefined) {
      await this.connections.update(stateRow.tenantId, stateRow.connectionId, { status: 'ERROR' });
      throw new BadRequestException(`${connectorSlug} authorization was cancelled or denied: ${oauthError}`);
    }
    if (code === undefined) {
      throw new BadRequestException('Missing authorization code');
    }
    const adapter = getAdapter(connectorSlug);
    if (adapter?.exchangeCode === undefined) {
      throw new BadRequestException(`Connector "${connectorSlug}" does not support OAuth code exchange`);
    }

    const tokenSet = await adapter.exchangeCode(
      { tenantId: stateRow.tenantId, connectionId: stateRow.connectionId, redirectUri: stateRow.redirectUri, state, codeVerifier: stateRow.codeVerifier },
      code,
    );

    await this.saveCredential(stateRow.tenantId, stateRow.connectionId, tokenSet.accessToken, tokenSet.refreshToken, 'OAUTH2', tokenSet.expiresAt, tokenSet.scope);

    const updated = await this.connections.update(stateRow.tenantId, stateRow.connectionId, {
      status: 'CONNECTED',
      externalAccountId: tokenSet.externalAccountId ?? null,
      externalAccountLabel: tokenSet.externalAccountLabel ?? null,
      lastSuccessAt: new Date(),
      lastTestedAt: new Date(),
    });
    if (updated === null) {
      throw new NotFoundException('Connection not found');
    }
    await this.audit.record({
      tenantId: stateRow.tenantId,
      action: 'connection.oauth_connected',
      entityType: 'Connection',
      entityId: stateRow.connectionId,
    });
    const credential = await this.credentials.findActiveForConnection(stateRow.tenantId, stateRow.connectionId);
    return toSummary(updated, credential);
  }

  async test(tenantId: string, connectionId: string, userId: string): Promise<TestConnectionResult> {
    return this.testInternalResult(tenantId, connectionId, userId);
  }

  private async testInternal(tenantId: string, connectionId: string, userId: string): Promise<ConnectionSummary> {
    await this.testInternalResult(tenantId, connectionId, userId);
    const connection = await this.connections.findById(tenantId, connectionId);
    const credential = await this.credentials.findActiveForConnection(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }
    return toSummary(connection, credential);
  }

  private async testInternalResult(tenantId: string, connectionId: string, userId: string): Promise<TestConnectionResult> {
    const checkedAt = new Date();
    try {
      const health = await this.runner.run(tenantId, connectionId, (adapter, ctx) => adapter.verifyCredentials(ctx));
      await this.connections.update(tenantId, connectionId, {
        status: 'CONNECTED',
        lastTestedAt: checkedAt,
        lastSuccessAt: checkedAt,
        ...(health.accountLabel !== null ? { externalAccountLabel: health.accountLabel } : {}),
      });
      await this.audit.record({ tenantId, actorId: userId, action: 'connection.tested', entityType: 'Connection', entityId: connectionId, after: { ok: true } });
      return { ok: true, accountLabel: health.accountLabel, scopes: health.scopes, latencyMs: health.latencyMs, message: health.message, checkedAt: checkedAt.toISOString() };
    } catch (error) {
      await this.connections.update(tenantId, connectionId, { status: 'ERROR', lastTestedAt: checkedAt });
      const message = error instanceof Error ? error.message : 'Connection test failed';
      await this.audit.record({ tenantId, actorId: userId, action: 'connection.tested', entityType: 'Connection', entityId: connectionId, after: { ok: false, message } });
      return { ok: false, accountLabel: null, scopes: [], latencyMs: 0, message, checkedAt: checkedAt.toISOString() };
    }
  }

  async rotateCredential(tenantId: string, connectionId: string, userId: string, input: RotateCredentialInput): Promise<ConnectionSummary> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }
    await this.saveCredential(tenantId, connectionId, input.value, input.secondaryValue, connection.authType === 'PAT' ? 'PAT' : 'API_KEY');
    await this.audit.record({ tenantId, actorId: userId, action: 'connection.credential_rotated', entityType: 'Connection', entityId: connectionId });
    return this.testInternal(tenantId, connectionId, userId);
  }

  async disconnect(tenantId: string, connectionId: string, userId: string, input: DisconnectConnectionInput): Promise<void> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }
    await this.credentials.deactivateAllForConnection(tenantId, connectionId);
    await this.connections.update(tenantId, connectionId, { status: 'DISCONNECTED', disconnectedAt: new Date(), retentionChoice: input.retention });
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'connection.disconnected',
      entityType: 'Connection',
      entityId: connectionId,
      after: { retention: input.retention },
    });
    // `input.retention === 'PURGE'` would delete orphaned Listing rows once
    // Listing exists (Phase 4) — the exact same forward-looking-seam pattern
    // as Phase 2's ProductsService.assertNoLiveDependencies (docs/DEBT.md 2-D8).
    // Nothing to purge yet in this schema.
  }

  async health(tenantId: string, connectionId: string): Promise<ConnectionHealthView> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }
    const samples = await this.healthSamples.recentForConnection(tenantId, connectionId, env.CONNECTION_HEALTH_SAMPLE_RETENTION);
    const total = samples.length;
    const failures = samples.filter((s) => !s.success).length;
    const latencies = samples.filter((s) => s.latencyMs !== null).map((s) => s.latencyMs as number);
    const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const credential = await this.credentials.findActiveForConnection(tenantId, connectionId);
    const tokenExpiresAt = credential?.expiresAt ?? null;

    return {
      connectionId,
      connectorSlug: connection.connectorSlug,
      label: connection.label,
      status: connection.status,
      lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
      errorRatePct: total > 0 ? Math.round((failures / total) * 1000) / 10 : 0,
      avgLatencyMs,
      rateLimitRemaining: samples[0]?.rateLimitRemaining ?? null,
      tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
      tokenExpiresInSeconds: tokenExpiresAt !== null ? Math.max(0, Math.round((tokenExpiresAt.getTime() - Date.now()) / 1000)) : null,
      samples: samples.map((s) => ({
        id: s.id,
        checkedAt: s.checkedAt.toISOString(),
        success: s.success,
        latencyMs: s.latencyMs,
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        rateLimitRemaining: s.rateLimitRemaining,
        rateLimitResetAt: s.rateLimitResetAt?.toISOString() ?? null,
      })),
      isSeedData: samples.length > 0 && samples.every((s) => s.isSeedData),
    };
  }

  /**
   * `Credential.encryptedSecondaryBlob` carries a different secret depending
   * on `kind`, deliberately — rather than adding a second nearly-identical
   * column: for `OAUTH2` it is the refresh token (what `TokenRefreshService`
   * needs to renew an expiring access token, implentationplanphase.md task
   * 3.13); for `API_KEY` on a connector with split sandbox/live keys
   * (Prodigi, api-registration.md §2.1) it is the OTHER environment's key.
   * `AdapterRunnerService.resolve()` is the one place that reads this column
   * back and knows which interpretation applies, via the same `kind` field.
   */
  private async saveCredential(
    tenantId: string,
    connectionId: string,
    value: string,
    secondaryValue: string | undefined,
    kind: 'OAUTH2' | 'API_KEY' | 'PAT' | 'HMAC_PAIR' | 'NONE',
    expiresAt?: string,
    scope?: string,
  ): Promise<void> {
    await this.credentials.deactivateAllForConnection(tenantId, connectionId);
    const encryptedBlob = await this.vault.encryptForTenant(tenantId, value);
    const dekTenantKeyId = await this.vault.getActiveDekId(tenantId);
    await this.credentials.create({
      tenantId,
      connectionId,
      kind,
      encryptedBlob,
      encryptedSecondaryBlob: secondaryValue !== undefined ? await this.vault.encryptForTenant(tenantId, secondaryValue) : null,
      dekTenantKeyId,
      maskedHint: this.vault.maskedHint(value),
      scopes: scope !== undefined ? scope.split(' ') : [],
      expiresAt: expiresAt !== undefined ? new Date(expiresAt) : null,
    });
    this.logger.debug(`Credential saved for connection ${connectionId} (${kind})`);
  }
}

function toSummary(
  connection: { id: string; connectorSlug: string; label: string; status: string; authType: string; sandbox: boolean; scopesGranted: unknown; externalAccountLabel: string | null; lastTestedAt: Date | null; lastSuccessAt: Date | null; createdAt: Date },
  credential: { maskedHint: string | null; expiresAt: Date | null } | null,
): ConnectionSummary {
  return {
    id: connection.id,
    connectorSlug: connection.connectorSlug,
    label: connection.label,
    status: connection.status as ConnectionSummary['status'],
    authType: connection.authType,
    sandbox: connection.sandbox,
    scopesGranted: (connection.scopesGranted as string[] | null) ?? null,
    externalAccountLabel: connection.externalAccountLabel,
    maskedHint: credential?.maskedHint ?? null,
    lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
    lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
    expiresAt: credential?.expiresAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
  };
}
