import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionsService } from '../src/connections/connections.service';
import type { ConnectionRepository } from '../src/repositories/connection.repository';
import type { CredentialRepository } from '../src/repositories/credential.repository';
import type { ConnectorDefinitionRepository } from '../src/repositories/connector-definition.repository';
import type { ConnectorOAuthStateRepository } from '../src/repositories/connector-oauth-state.repository';
import type { ConnectionHealthSampleRepository } from '../src/repositories/connection-health-sample.repository';
import type { CredentialVaultService } from '../src/vault/credential-vault.service';
import type { AdapterRunnerService } from '../src/connections/adapter-runner.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

const tierAPrintfulDefinition = {
  id: 'def-printful',
  slug: 'printful',
  name: 'Printful',
  authType: 'API_KEY',
  tier: 'A',
  capabilities: { canAutomate: true },
};

const tierCRedbubbleDefinition = {
  id: 'def-redbubble',
  slug: 'redbubble',
  name: 'Redbubble',
  authType: 'NONE',
  tier: 'C',
  capabilities: { canAutomate: false },
};

function makeDeps() {
  const connectionsRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  };
  const credentialsRepo = {
    create: vi.fn(),
    findActiveForConnection: vi.fn().mockResolvedValue(null),
    deactivateAllForConnection: vi.fn(),
    findExpiringSoon: vi.fn(),
    update: vi.fn(),
  };
  const connectorDefs = {
    findBySlug: vi.fn(),
    findById: vi.fn(),
  };
  const oauthStates = { create: vi.fn(), consume: vi.fn() };
  const healthSamples = { record: vi.fn(), recentForConnection: vi.fn().mockResolvedValue([]) };
  const vault = {
    encryptForTenant: vi.fn().mockResolvedValue('cipher:xyz'),
    decryptForTenant: vi.fn().mockResolvedValue('plaintext-secret'),
    maskedHint: vi.fn().mockReturnValue('sk_live_••••1234'),
    getActiveDekId: vi.fn().mockResolvedValue('dek-1'),
  };
  const runner = { run: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  return { connectionsRepo, credentialsRepo, connectorDefs, oauthStates, healthSamples, vault, runner, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>): ConnectionsService {
  return new ConnectionsService(
    deps.connectionsRepo as unknown as ConnectionRepository,
    deps.credentialsRepo as unknown as CredentialRepository,
    deps.connectorDefs as unknown as ConnectorDefinitionRepository,
    deps.oauthStates as unknown as ConnectorOAuthStateRepository,
    deps.healthSamples as unknown as ConnectionHealthSampleRepository,
    deps.vault as unknown as CredentialVaultService,
    deps.runner as unknown as AdapterRunnerService,
    deps.audit as unknown as AuditLogService,
  );
}

describe('ConnectionsService.create', () => {
  it('refuses to create a connection for a Tier C connector (brb.md §6 hard rule)', async () => {
    const deps = makeDeps();
    deps.connectorDefs.findBySlug.mockResolvedValue(tierCRedbubbleDefinition);
    const service = makeService(deps);

    await expect(
      service.create('t1', 'u1', { connectorSlug: 'redbubble', label: 'My Redbubble', sandbox: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.connectionsRepo.create).not.toHaveBeenCalled();
  });

  it('404s for an unregistered connector slug', async () => {
    const deps = makeDeps();
    deps.connectorDefs.findBySlug.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(
      service.create('t1', 'u1', { connectorSlug: 'not-a-real-connector', label: 'x', sandbox: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates + encrypts + tests an API_KEY connection in one call', async () => {
    const deps = makeDeps();
    deps.connectorDefs.findBySlug.mockResolvedValue(tierAPrintfulDefinition);
    deps.connectionsRepo.create.mockResolvedValue({
      id: 'conn-1',
      connectorSlug: 'printful',
      label: 'My Printful',
      status: 'PENDING',
      authType: 'API_KEY',
      sandbox: false,
      scopesGranted: null,
      externalAccountLabel: null,
      lastTestedAt: null,
      lastSuccessAt: null,
      createdAt: new Date(),
    });
    deps.connectionsRepo.findById.mockResolvedValue({
      id: 'conn-1',
      connectorSlug: 'printful',
      label: 'My Printful',
      status: 'CONNECTED',
      authType: 'API_KEY',
      sandbox: false,
      scopesGranted: null,
      externalAccountLabel: 'Demo Studio Store',
      lastTestedAt: new Date(),
      lastSuccessAt: new Date(),
      createdAt: new Date(),
    });
    deps.runner.run.mockResolvedValue({ ok: true, accountLabel: 'Demo Studio Store', scopes: [], latencyMs: 42, message: 'Connected' });

    const service = makeService(deps);
    const result = await service.create('t1', 'u1', {
      connectorSlug: 'printful',
      label: 'My Printful',
      sandbox: false,
      credential: { kind: 'API_KEY', value: 'pk_live_secret_value' },
    });

    expect(deps.vault.encryptForTenant).toHaveBeenCalledWith('t1', 'pk_live_secret_value');
    expect(deps.credentialsRepo.create).toHaveBeenCalledOnce();
    expect(result.status).toBe('CONNECTED');
    expect(result.externalAccountLabel).toBe('Demo Studio Store');
  });

  it('rejects an API_KEY/PAT connector create with no credential supplied', async () => {
    const deps = makeDeps();
    deps.connectorDefs.findBySlug.mockResolvedValue(tierAPrintfulDefinition);
    deps.connectionsRepo.create.mockResolvedValue({ id: 'conn-1', connectorSlug: 'printful', authType: 'API_KEY' });
    const service = makeService(deps);
    await expect(service.create('t1', 'u1', { connectorSlug: 'printful', label: 'x', sandbox: false })).rejects.toThrow(/requires a credential/);
  });
});

describe('ConnectionsService.disconnect', () => {
  it('deactivates credentials and records the retention choice', async () => {
    const deps = makeDeps();
    deps.connectionsRepo.findById.mockResolvedValue({ id: 'conn-1' });
    const service = makeService(deps);
    await service.disconnect('t1', 'conn-1', 'u1', { retention: 'PURGE' });
    expect(deps.credentialsRepo.deactivateAllForConnection).toHaveBeenCalledWith('t1', 'conn-1');
    expect(deps.connectionsRepo.update).toHaveBeenCalledWith('t1', 'conn-1', expect.objectContaining({ status: 'DISCONNECTED', retentionChoice: 'PURGE' }));
  });

  it('404s disconnecting an unknown connection', async () => {
    const deps = makeDeps();
    deps.connectionsRepo.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.disconnect('t1', 'missing', 'u1', { retention: 'KEEP_ORPHAN' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ConnectionsService.test', () => {
  it('reports a failed test without throwing, and marks the connection ERROR', async () => {
    const deps = makeDeps();
    deps.runner.run.mockRejectedValue(new Error('Printful rejected the credential'));
    const service = makeService(deps);
    const result = await service.test('t1', 'conn-1', 'u1');
    expect(result.ok).toBe(false);
    expect(deps.connectionsRepo.update).toHaveBeenCalledWith('t1', 'conn-1', expect.objectContaining({ status: 'ERROR' }));
  });
});
