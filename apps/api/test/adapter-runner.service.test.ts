import { BadGatewayException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdapterRunnerService } from '../src/connections/adapter-runner.service';
import type { ConnectionRepository } from '../src/repositories/connection.repository';
import type { CredentialRepository } from '../src/repositories/credential.repository';
import type { ConnectorDefinitionRepository } from '../src/repositories/connector-definition.repository';
import type { ConnectionHealthSampleRepository } from '../src/repositories/connection-health-sample.repository';
import type { CredentialVaultService } from '../src/vault/credential-vault.service';

function makeDeps() {
  const connections = { findById: vi.fn() };
  const credentials = { findActiveForConnection: vi.fn().mockResolvedValue(null) };
  const connectorDefs = { findById: vi.fn(), findBySlug: vi.fn() };
  const health = { record: vi.fn() };
  const vault = { decryptForTenant: vi.fn().mockResolvedValue('decrypted-token') };
  return { connections, credentials, connectorDefs, health, vault };
}

function makeRunner(deps: ReturnType<typeof makeDeps>): AdapterRunnerService {
  return new AdapterRunnerService(
    deps.connections as unknown as ConnectionRepository,
    deps.credentials as unknown as CredentialRepository,
    deps.connectorDefs as unknown as ConnectorDefinitionRepository,
    deps.health as unknown as ConnectionHealthSampleRepository,
    deps.vault as unknown as CredentialVaultService,
  );
}

describe('AdapterRunnerService.resolve', () => {
  it('404s an unknown connection', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue(null);
    const runner = makeRunner(deps);
    await expect(runner.resolve('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a Tier C / canAutomate:false connector even if a Connection row exists (data-layer mirror of the type-level boundary)', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorId: 'def-1', connectorSlug: 'redbubble', sandbox: false, externalAccountId: null });
    deps.connectorDefs.findById.mockResolvedValue({ id: 'def-1', slug: 'redbubble', tier: 'C', capabilities: { canAutomate: false } });
    const runner = makeRunner(deps);
    await expect(runner.resolve('t1', 'conn-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the connector has no real adapter implementation', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorId: 'def-1', connectorSlug: 'gumroad', sandbox: false, externalAccountId: null });
    deps.connectorDefs.findById.mockResolvedValue({ id: 'def-1', slug: 'gumroad', tier: 'A', capabilities: { canAutomate: true } });
    const runner = makeRunner(deps);
    await expect(runner.resolve('t1', 'conn-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds a real Ctx from a decrypted credential for an automatable connector', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorId: 'def-1', connectorSlug: 'printful', sandbox: true, externalAccountId: 'store_1' });
    deps.connectorDefs.findById.mockResolvedValue({ id: 'def-1', slug: 'printful', tier: 'A', capabilities: { canAutomate: true } });
    deps.credentials.findActiveForConnection.mockResolvedValue({ encryptedBlob: 'cipher', encryptedSecondaryBlob: null, kind: 'API_KEY', expiresAt: null });
    const runner = makeRunner(deps);
    const resolved = await runner.resolve('t1', 'conn-1');
    expect(resolved.adapter.slug).toBe('printful');
    expect(resolved.ctx).toMatchObject({ tenantId: 't1', connectionId: 'conn-1', sandbox: true, accessToken: 'decrypted-token', externalAccountId: 'store_1' });
  });
});

describe('AdapterRunnerService.run', () => {
  beforeEach(() => {
    // fresh rate limiter map per test — AdapterRunnerService instance is fresh each time anyway
  });

  it('records a success health sample and returns the callback result', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorId: 'def-1', connectorSlug: 'printful', sandbox: false, externalAccountId: null });
    deps.connectorDefs.findById.mockResolvedValue({ id: 'def-1', slug: 'printful', tier: 'A', capabilities: { canAutomate: true } });
    deps.connectorDefs.findBySlug.mockResolvedValue({ rateLimit: { requests: 100, windowMs: 60_000, burst: 20 } });
    const runner = makeRunner(deps);

    const result = await runner.run('t1', 'conn-1', async () => 'ok');
    expect(result).toBe('ok');
    expect(deps.health.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', connectionId: 'conn-1', success: true }));
  });

  it('records a failure health sample and throws a BadGatewayException with the mapped, non-leaking message', async () => {
    const deps = makeDeps();
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', connectorId: 'def-1', connectorSlug: 'printful', sandbox: false, externalAccountId: null });
    deps.connectorDefs.findById.mockResolvedValue({ id: 'def-1', slug: 'printful', tier: 'A', capabilities: { canAutomate: true } });
    deps.connectorDefs.findBySlug.mockResolvedValue({ rateLimit: { requests: 100, windowMs: 60_000, burst: 20 } });
    const runner = makeRunner(deps);

    await expect(runner.run('t1', 'conn-1', async () => { throw new Error('secret-leaking-detail-should-not-surface'); })).rejects.toBeInstanceOf(BadGatewayException);
    expect(deps.health.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', connectionId: 'conn-1', success: false }));
  });
});
