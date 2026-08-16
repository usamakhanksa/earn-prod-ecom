import { Injectable, Logger } from '@nestjs/common';
import { getAdapter } from '@omnisell/connectors';
import { CredentialRepository } from '../repositories/credential.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { CredentialVaultService } from '../vault/credential-vault.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditLogService } from '../audit/audit-log.service';

export interface TokenRefreshSweepResult {
  checked: number;
  refreshed: number;
  failed: number;
  alertedNoRefreshToken: number;
}

/**
 * Token auto-refresh worker (prompt.md / implentationplanphase.md task 3.13).
 * `runSweep()` is real, fully callable logic — every step (finding expiring
 * credentials, decrypting, calling `adapter.refresh`, re-encrypting, writing
 * back, alerting) genuinely runs and is unit-tested with mocked repositories.
 * The only honestly-stubbed part is SCHEDULING: a recurring trigger belongs
 * on a BullMQ repeatable job (`ConnectorQueueService`), which needs Redis
 * (unavailable in this sandbox, docs/DEBT.md) — nothing here changes once
 * that scheduling exists; `runSweep()` is exactly what the repeatable job's
 * processor would call.
 */
@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    private readonly credentials: CredentialRepository,
    private readonly connections: ConnectionRepository,
    private readonly vault: CredentialVaultService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditLogService,
  ) {}

  /** `windowHours`: how far ahead of expiry to start refreshing — a pre-expiry
   * window (featureslist.md 4.5), not "refresh only once already expired". */
  async runSweep(windowHours = 24): Promise<TokenRefreshSweepResult> {
    const expiringSoon = await this.credentials.findExpiringSoon(new Date(Date.now() + windowHours * 60 * 60 * 1000));
    const result: TokenRefreshSweepResult = { checked: expiringSoon.length, refreshed: 0, failed: 0, alertedNoRefreshToken: 0 };

    for (const credential of expiringSoon) {
      await this.refreshOne(credential, result);
    }
    return result;
  }

  private async refreshOne(
    credential: { id: string; tenantId: string; connectionId: string; encryptedBlob: string; encryptedSecondaryBlob: string | null; expiresAt: Date | null },
    result: TokenRefreshSweepResult,
  ): Promise<void> {
    const connection = await this.connections.findById(credential.tenantId, credential.connectionId);
    if (connection === null) {
      return;
    }
    const adapter = getAdapter(connection.connectorSlug);
    if (adapter?.refresh === undefined) {
      // Printify/Gelato/Prodigi are API-key/PAT in this phase (api-registration.md
      // §2.1) — nothing to refresh. Only Printful's OAuth2 path reaches here.
      return;
    }
    if (credential.encryptedSecondaryBlob === null) {
      // No refresh token was ever stored for this credential — alert instead
      // of silently letting it lapse (featureslist.md 4.5's "failure alert").
      await this.alertExpiring(connection, credential.expiresAt);
      result.alertedNoRefreshToken += 1;
      return;
    }

    try {
      const accessToken = await this.vault.decryptForTenant(credential.tenantId, credential.encryptedBlob);
      const refreshToken = await this.vault.decryptForTenant(credential.tenantId, credential.encryptedSecondaryBlob);
      const newTokenSet = await adapter.refresh(
        { tenantId: credential.tenantId, connectionId: credential.connectionId, redirectUri: '', state: '' },
        { accessToken, refreshToken, ...(credential.expiresAt !== null ? { expiresAt: credential.expiresAt.toISOString() } : {}) },
      );

      await this.credentials.update(credential.tenantId, credential.id, { isActive: false });
      const encryptedBlob = await this.vault.encryptForTenant(credential.tenantId, newTokenSet.accessToken);
      const dekTenantKeyId = await this.vault.getActiveDekId(credential.tenantId);
      await this.credentials.create({
        tenantId: credential.tenantId,
        connectionId: credential.connectionId,
        kind: 'OAUTH2',
        encryptedBlob,
        encryptedSecondaryBlob:
          newTokenSet.refreshToken !== undefined ? await this.vault.encryptForTenant(credential.tenantId, newTokenSet.refreshToken) : null,
        dekTenantKeyId,
        maskedHint: this.vault.maskedHint(newTokenSet.accessToken),
        scopes: newTokenSet.scope !== undefined ? newTokenSet.scope.split(' ') : [],
        expiresAt: newTokenSet.expiresAt !== undefined ? new Date(newTokenSet.expiresAt) : null,
        rotatedAt: new Date(),
      });
      await this.audit.record({
        tenantId: credential.tenantId,
        action: 'connection.token_auto_refreshed',
        entityType: 'Connection',
        entityId: credential.connectionId,
      });
      result.refreshed += 1;
    } catch (error) {
      this.logger.warn(`Token refresh failed for connection ${credential.connectionId}: ${String(error)}`);
      await this.alertExpiring(connection, credential.expiresAt);
      result.failed += 1;
    }
  }

  private async alertExpiring(connection: { id: string; tenantId: string; connectorSlug: string; label: string; createdById: string }, expiresAt: Date | null): Promise<void> {
    await this.audit.record({
      tenantId: connection.tenantId,
      action: 'connection.token_expiry_alert',
      entityType: 'Connection',
      entityId: connection.id,
      after: { connectionLabel: connection.label, expiresAt: expiresAt?.toISOString() ?? null },
    });
    await this.notifications.dispatch({
      tenantId: connection.tenantId,
      userId: connection.createdById,
      type: 'SECURITY',
      title: `Reconnect ${connection.connectorSlug}`,
      body: `Your "${connection.label}" connection needs attention — its token could not be automatically renewed${expiresAt !== null ? ` (expires ${expiresAt.toISOString()})` : ''}. Reconnect it from Channels → Connections.`,
    });
  }
}
