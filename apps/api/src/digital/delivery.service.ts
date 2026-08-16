import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { DeliveryIssueResult, IssueDeliveryInput } from '@omnisell/shared';
import { DeliveryRepository } from '../repositories/delivery.repository';
import { EntitlementRepository } from '../repositories/entitlement.repository';
import { DigitalProductRepository } from '../repositories/digital-product.repository';
import { S3PresignService } from '../common/storage/s3-presign.service';
import { env } from '../config/env';

export type DeliveryDenialReason = 'EXPIRED' | 'DOWNLOAD_CAP_REACHED' | 'IP_MISMATCH' | 'REVOKED' | 'ENTITLEMENT_REVOKED';

/**
 * Digital delivery: time-limited, IP- and download-count-capped signed URLs
 * with a resend + audit log (featureslist.md 7.2/7.5, task 5.10). Reuses
 * Phase 2's `S3PresignService` for the actual SigV4 signing (task's own
 * instruction: "extend for time-limited/capped download tokens", not
 * reinvent presigning) — the bearer token buyers actually receive is an
 * OmniSell-issued opaque redemption token, never a raw, unbounded S3 URL:
 * every redemption round-trips through `redeem()` so the count/IP/expiry
 * caps are enforced server-side on every single download attempt, not just
 * at issuance time.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly entitlements: EntitlementRepository,
    private readonly digitalProducts: DigitalProductRepository,
    private readonly presign: S3PresignService,
  ) {}

  async issue(tenantId: string, entitlementId: string, input: IssueDeliveryInput): Promise<DeliveryIssueResult> {
    const entitlement = await this.entitlements.findById(tenantId, entitlementId);
    if (entitlement === null) {
      throw new NotFoundException({ message: 'Entitlement not found', code: 'ENTITLEMENT_NOT_FOUND' });
    }
    if (entitlement.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'This entitlement has been revoked', code: 'ENTITLEMENT_REVOKED' });
    }
    const version = await this.digitalProducts.findCurrentVersion(tenantId, input.digitalFileId);
    if (version === null) {
      throw new NotFoundException({ message: 'This digital file has no current version', code: 'DIGITAL_FILE_VERSION_NOT_FOUND' });
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    await this.deliveries.createToken({
      tenantId,
      entitlementId,
      digitalFileVersionId: version.id,
      tokenHash,
      expiresAt,
      maxDownloads: input.maxDownloads,
      allowedIp: input.allowedIp ?? null,
    });
    await this.deliveries.createLog({ tenantId, entitlementId, digitalFileVersionId: version.id, action: 'ISSUED', ipAddress: input.allowedIp ?? null });

    return {
      url: `${env.API_URL}/v1/deliveries/redeem/${rawToken}`,
      expiresAt: expiresAt.toISOString(),
      maxDownloads: input.maxDownloads,
    };
  }

  async resend(tenantId: string, entitlementId: string, digitalFileId: string): Promise<DeliveryIssueResult> {
    const result = await this.issue(tenantId, entitlementId, { digitalFileId, ttlSeconds: 24 * 3600, maxDownloads: 5 });
    const version = await this.digitalProducts.findCurrentVersion(tenantId, digitalFileId);
    if (version !== null) {
      await this.deliveries.createLog({ tenantId, entitlementId, digitalFileVersionId: version.id, action: 'RESENT' });
    }
    return result;
  }

  /** Public (no OmniSell auth — the buyer may have no account), un-tenant-
   * scoped by path since the token itself IS the authorization: only its
   * sha256 is ever looked up, never a raw tenant-scoped id. Real signed URL
   * is generated FRESH per redemption (never reused), so a captured
   * short-lived redirect target can't be replayed past its own TTL either. */
  async redeem(rawToken: string, ip: string | null): Promise<{ url: string } | { denied: DeliveryDenialReason }> {
    const tokenHash = sha256(rawToken);
    const token = await this.deliveries.findTokenByHash(tokenHash);
    if (token === null) {
      throw new NotFoundException({ message: 'Delivery link not found or already expired', code: 'DELIVERY_TOKEN_NOT_FOUND' });
    }
    const deny = async (reason: DeliveryDenialReason): Promise<{ denied: DeliveryDenialReason }> => {
      await this.deliveries.createLog({ tenantId: token.tenantId, entitlementId: token.entitlementId, digitalFileVersionId: token.digitalFileVersionId, deliveryTokenId: token.id, action: 'DENIED', ipAddress: ip, reason });
      return { denied: reason };
    };

    if (token.revokedAt !== null) return deny('REVOKED');
    if (token.entitlement.status !== 'ACTIVE') return deny('ENTITLEMENT_REVOKED');
    if (token.expiresAt.getTime() < Date.now()) return deny('EXPIRED');
    if (token.downloadCount >= token.maxDownloads) return deny('DOWNLOAD_CAP_REACHED');
    if (token.allowedIp !== null && ip !== null && token.allowedIp !== ip) return deny('IP_MISMATCH');

    await this.deliveries.incrementDownloadCount(token.id);
    await this.deliveries.createLog({ tenantId: token.tenantId, entitlementId: token.entitlementId, digitalFileVersionId: token.digitalFileVersionId, deliveryTokenId: token.id, action: 'DOWNLOADED', ipAddress: ip });

    const { url } = await this.presign.presignGet(token.digitalFileVersion.storageKey, 60);
    return { url };
  }

  async listLogs(tenantId: string, entitlementId: string) {
    return this.deliveries.listLogsForEntitlement(tenantId, entitlementId);
  }

  async listAllLogs(tenantId: string, cursor: string | undefined, limit: number) {
    return this.deliveries.listLogs(tenantId, cursor, limit);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
