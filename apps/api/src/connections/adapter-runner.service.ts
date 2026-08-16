import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ConnectorAdapter, Ctx } from '@omnisell/connectors';
import { ConnectorRateLimiter, getAdapter } from '@omnisell/connectors';
import type { ConnectorRateLimitConfig } from '@omnisell/shared';
import { ConnectionRepository } from '../repositories/connection.repository';
import { CredentialRepository } from '../repositories/credential.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { ConnectionHealthSampleRepository } from '../repositories/connection-health-sample.repository';
import { CredentialVaultService } from '../vault/credential-vault.service';

export interface ResolvedConnection {
  connectionId: string;
  connectorSlug: string;
  adapter: ConnectorAdapter;
  ctx: Ctx;
}

/**
 * The one place `apps/api` bridges a Prisma `Connection`/`Credential` row into
 * a `Ctx` and calls into `@omnisell/connectors`. Owns the per-connector rate
 * limiter instances (implentationplanphase.md task 3.5) and every
 * `ConnectionHealthSample` write (featureslist.md 4.9) — every real or
 * simulated adapter call, success or failure, produces exactly one sample.
 */
@Injectable()
export class AdapterRunnerService {
  private readonly logger = new Logger(AdapterRunnerService.name);
  private readonly rateLimiters = new Map<string, ConnectorRateLimiter>();

  constructor(
    private readonly connections: ConnectionRepository,
    private readonly credentials: CredentialRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly health: ConnectionHealthSampleRepository,
    private readonly vault: CredentialVaultService,
  ) {}

  async resolve(tenantId: string, connectionId: string): Promise<ResolvedConnection> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null) {
      throw new NotFoundException('Connection not found');
    }
    const definition = await this.connectorDefs.findById(connection.connectorId);
    if (definition === null) {
      throw new NotFoundException('Connector definition not found for this connection');
    }
    const capabilities = definition.capabilities as { canAutomate: boolean };
    if (capabilities.canAutomate !== true) {
      // Mirrors the compile-time boundary at the data layer: a Tier C/D row
      // should never have reached this far (ConnectionsService.create already
      // refuses to create one), but this is the last line of defence before
      // any adapter call — brb.md §6's hard rule, enforced twice.
      throw new ForbiddenException(`Connector "${connection.connectorSlug}" is not automatable (Tier ${definition.tier}) — Export Pack only`);
    }
    const adapter = getAdapter(connection.connectorSlug);
    if (adapter === undefined) {
      throw new NotFoundException(`No adapter implementation exists for "${connection.connectorSlug}" yet`);
    }
    const credential = await this.credentials.findActiveForConnection(tenantId, connectionId);
    // `encryptedSecondaryBlob` means different things per `kind` — see the
    // doc comment on ConnectionsService.saveCredential. OAUTH2 → refresh
    // token (Ctx.refreshToken); anything else (Prodigi's API_KEY dual
    // sandbox/live pair) → Ctx.secondaryToken.
    const secondaryPlaintext =
      credential?.encryptedSecondaryBlob !== null && credential?.encryptedSecondaryBlob !== undefined
        ? await this.vault.decryptForTenant(tenantId, credential.encryptedSecondaryBlob)
        : undefined;
    const ctx: Ctx = {
      tenantId,
      connectionId,
      sandbox: connection.sandbox,
      ...(credential !== null ? { accessToken: await this.vault.decryptForTenant(tenantId, credential.encryptedBlob) } : {}),
      ...(secondaryPlaintext !== undefined
        ? credential?.kind === 'OAUTH2'
          ? { refreshToken: secondaryPlaintext }
          : { secondaryToken: secondaryPlaintext }
        : {}),
      ...(credential?.expiresAt !== null && credential?.expiresAt !== undefined ? { expiresAt: credential.expiresAt.toISOString() } : {}),
      ...(connection.externalAccountId !== null ? { externalAccountId: connection.externalAccountId } : {}),
    };
    return { connectionId, connectorSlug: connection.connectorSlug, adapter, ctx };
  }

  private rateLimiterFor(slug: string, rateLimit: ConnectorRateLimitConfig): ConnectorRateLimiter {
    let limiter = this.rateLimiters.get(slug);
    if (limiter === undefined) {
      const refillPerSec = rateLimit.requests / (rateLimit.windowMs / 1000);
      limiter = new ConnectorRateLimiter({ capacity: rateLimit.requests, refillPerSec, burst: rateLimit.burst });
      this.rateLimiters.set(slug, limiter);
    }
    return limiter;
  }

  /** Runs one adapter call under this connector's rate limiter + per-tenant
   * fairness queue, and always records exactly one health sample. Throws a
   * `BadGatewayException` carrying the adapter's mapped user-facing message
   * on failure — never the raw provider error, never a leaked credential. */
  async run<T>(tenantId: string, connectionId: string, fn: (adapter: ConnectorAdapter, ctx: Ctx) => Promise<T>): Promise<T> {
    const { adapter, ctx, connectorSlug } = await this.resolve(tenantId, connectionId);
    const definition = await this.connectorDefs.findBySlug(connectorSlug);
    const rateLimit = (definition?.rateLimit ?? { requests: 60, windowMs: 60_000, burst: 10 }) as unknown as ConnectorRateLimitConfig;
    await this.rateLimiterFor(connectorSlug, rateLimit).acquire(tenantId);

    const startedAt = Date.now();
    try {
      const result = await fn(adapter, ctx);
      await this.health.record({
        tenantId,
        connectionId,
        success: true,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const mapped = adapter.mapError(error);
      await this.health.record({
        tenantId,
        connectionId,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorCode: mapped.code,
        errorMessage: mapped.userMessage,
      });
      this.logger.warn(`Adapter call failed for connection ${connectionId} (${connectorSlug}): ${mapped.code}`);
      throw new BadGatewayException({ message: mapped.userMessage, code: mapped.code, retryable: mapped.retryable, docsHint: mapped.docsHint });
    }
  }
}
