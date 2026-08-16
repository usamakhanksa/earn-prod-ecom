import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenRefreshService } from '../src/token-refresh/token-refresh.service';
import type { CredentialRepository } from '../src/repositories/credential.repository';
import type { ConnectionRepository } from '../src/repositories/connection.repository';
import type { CredentialVaultService } from '../src/vault/credential-vault.service';
import type { NotificationService } from '../src/notifications/notification.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

// `vi.hoisted` runs before `vi.mock`'s factory (both hoisted above every
// import in this file) so the factory below can safely reference these —
// a plain `const` declared later would be in its temporal dead zone when the
// mocked `@omnisell/connectors` module is first resolved.
const { fakeRefreshableAdapter, fakeNonRefreshableAdapter } = vi.hoisted(() => {
  const errorResult = { code: 'UNKNOWN' as const, retryable: false, userMessage: 'x', docsHint: null, httpStatus: null };
  return {
    fakeRefreshableAdapter: {
      slug: 'printful',
      capabilities: { canAutomate: true },
      refresh: vi.fn(),
      async verifyCredentials() {
        return { ok: true, accountLabel: null, scopes: [], latencyMs: 0, message: '' };
      },
      mapError() {
        return errorResult;
      },
    },
    fakeNonRefreshableAdapter: {
      slug: 'printify',
      capabilities: { canAutomate: true },
      async verifyCredentials() {
        return { ok: true, accountLabel: null, scopes: [], latencyMs: 0, message: '' };
      },
      mapError() {
        return errorResult;
      },
    },
  };
});

vi.mock('@omnisell/connectors', async () => {
  const actual = await vi.importActual<typeof import('@omnisell/connectors')>('@omnisell/connectors');
  return {
    ...actual,
    getAdapter: (slug: string) => (slug === 'printful' ? fakeRefreshableAdapter : slug === 'printify' ? fakeNonRefreshableAdapter : undefined),
  };
});

function makeDeps() {
  const credentials = { findExpiringSoon: vi.fn(), update: vi.fn(), create: vi.fn() };
  const connections = { findById: vi.fn() };
  const vault = {
    decryptForTenant: vi.fn().mockResolvedValue('plaintext'),
    encryptForTenant: vi.fn().mockResolvedValue('cipher'),
    maskedHint: vi.fn().mockReturnValue('••••1234'),
    getActiveDekId: vi.fn().mockResolvedValue('dek-1'),
  };
  const notifications = { dispatch: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { credentials, connections, vault, notifications, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new TokenRefreshService(
    deps.credentials as unknown as CredentialRepository,
    deps.connections as unknown as ConnectionRepository,
    deps.vault as unknown as CredentialVaultService,
    deps.notifications as unknown as NotificationService,
    deps.audit as unknown as AuditLogService,
  );
}

describe('TokenRefreshService.runSweep', () => {
  beforeEach(() => {
    fakeRefreshableAdapter.refresh.mockReset();
  });

  it('skips connectors whose adapter has no refresh() (Printify/Gelato/Prodigi are API-key based this phase)', async () => {
    const deps = makeDeps();
    deps.credentials.findExpiringSoon.mockResolvedValue([
      { id: 'cred-1', tenantId: 't1', connectionId: 'conn-1', encryptedBlob: 'x', encryptedSecondaryBlob: null, expiresAt: new Date() },
    ]);
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', tenantId: 't1', connectorSlug: 'printify', label: 'My Printify', createdById: 'u1' });
    const service = makeService(deps);

    const result = await service.runSweep();
    expect(result).toEqual({ checked: 1, refreshed: 0, failed: 0, alertedNoRefreshToken: 0 });
    expect(deps.notifications.dispatch).not.toHaveBeenCalled();
  });

  it('alerts (audit + notification) when no refresh token was ever stored', async () => {
    const deps = makeDeps();
    deps.credentials.findExpiringSoon.mockResolvedValue([
      { id: 'cred-1', tenantId: 't1', connectionId: 'conn-1', encryptedBlob: 'x', encryptedSecondaryBlob: null, expiresAt: new Date() },
    ]);
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', tenantId: 't1', connectorSlug: 'printful', label: 'My Printful', createdById: 'u1' });
    const service = makeService(deps);

    const result = await service.runSweep();
    expect(result.alertedNoRefreshToken).toBe(1);
    expect(deps.notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', userId: 'u1', type: 'SECURITY' }));
    expect(deps.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'connection.token_expiry_alert' }));
  });

  it('refreshes successfully when a refresh token is available, and writes a new active Credential', async () => {
    const deps = makeDeps();
    deps.credentials.findExpiringSoon.mockResolvedValue([
      { id: 'cred-1', tenantId: 't1', connectionId: 'conn-1', encryptedBlob: 'x', encryptedSecondaryBlob: 'y', expiresAt: new Date() },
    ]);
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', tenantId: 't1', connectorSlug: 'printful', label: 'My Printful', createdById: 'u1' });
    fakeRefreshableAdapter.refresh.mockResolvedValue({ accessToken: 'new-token', refreshToken: 'new-refresh', expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    const service = makeService(deps);

    const result = await service.runSweep();
    expect(result.refreshed).toBe(1);
    expect(deps.credentials.update).toHaveBeenCalledWith('t1', 'cred-1', { isActive: false });
    expect(deps.credentials.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', connectionId: 'conn-1', kind: 'OAUTH2', encryptedBlob: 'cipher' }));
    expect(deps.notifications.dispatch).not.toHaveBeenCalled();
  });

  it('alerts on a refresh failure instead of throwing and losing the whole sweep', async () => {
    const deps = makeDeps();
    deps.credentials.findExpiringSoon.mockResolvedValue([
      { id: 'cred-1', tenantId: 't1', connectionId: 'conn-1', encryptedBlob: 'x', encryptedSecondaryBlob: 'y', expiresAt: new Date() },
    ]);
    deps.connections.findById.mockResolvedValue({ id: 'conn-1', tenantId: 't1', connectorSlug: 'printful', label: 'My Printful', createdById: 'u1' });
    fakeRefreshableAdapter.refresh.mockRejectedValue(new Error('refresh_token expired'));
    const service = makeService(deps);

    const result = await service.runSweep();
    expect(result.failed).toBe(1);
    expect(deps.notifications.dispatch).toHaveBeenCalledOnce();
  });
});
