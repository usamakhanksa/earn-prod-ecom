import { describe, expect, it, vi } from 'vitest';
import { DeliveryService } from '../src/digital/delivery.service';
import type { DeliveryRepository } from '../src/repositories/delivery.repository';
import type { EntitlementRepository } from '../src/repositories/entitlement.repository';
import type { DigitalProductRepository } from '../src/repositories/digital-product.repository';
import type { S3PresignService } from '../src/common/storage/s3-presign.service';

const activeEntitlement = { id: 'ent-1', tenantId: 't1', status: 'ACTIVE' };
const currentVersion = { id: 'ver-1', digitalFileId: 'file-1', storageKey: 'tenants/t1/digital/file-1/v1.zip', isCurrent: true };

function makeDeps() {
  const deliveries = {
    createToken: vi.fn().mockResolvedValue({ id: 'token-1' }),
    createLog: vi.fn().mockResolvedValue(undefined),
    findTokenByHash: vi.fn(),
    incrementDownloadCount: vi.fn().mockResolvedValue(undefined),
  };
  const entitlements = { findById: vi.fn().mockResolvedValue(activeEntitlement) };
  const digitalProducts = { findCurrentVersion: vi.fn().mockResolvedValue(currentVersion) };
  const presign = { presignGet: vi.fn().mockResolvedValue({ url: 'https://signed.example/object', expiresAt: new Date() }) };
  return { deliveries, entitlements, digitalProducts, presign };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new DeliveryService(
    deps.deliveries as unknown as DeliveryRepository,
    deps.entitlements as unknown as EntitlementRepository,
    deps.digitalProducts as unknown as DigitalProductRepository,
    deps.presign as unknown as S3PresignService,
  );
}

describe('DeliveryService — TTL + download-count + IP caps (featureslist.md 7.2)', () => {
  it('issue() creates a token and returns an OmniSell redemption URL, never a raw storage key', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.issue('t1', 'ent-1', { digitalFileId: 'file-1', ttlSeconds: 3600, maxDownloads: 3 });
    expect(result.url).toMatch(/\/v1\/deliveries\/redeem\//);
    expect(result.maxDownloads).toBe(3);
    expect(deps.deliveries.createToken).toHaveBeenCalledWith(expect.objectContaining({ maxDownloads: 3, entitlementId: 'ent-1' }));
  });

  it('redeem() denies an expired token without incrementing the download count', async () => {
    const deps = makeDeps();
    deps.deliveries.findTokenByHash.mockResolvedValue({
      id: 'token-1', tenantId: 't1', entitlementId: 'ent-1', digitalFileVersionId: 'ver-1',
      expiresAt: new Date(Date.now() - 1000), downloadCount: 0, maxDownloads: 5, allowedIp: null, revokedAt: null,
      entitlement: activeEntitlement, digitalFileVersion: currentVersion,
    });
    const service = makeService(deps);
    const result = await service.redeem('raw-token', '1.2.3.4');
    expect(result).toEqual({ denied: 'EXPIRED' });
    expect(deps.deliveries.incrementDownloadCount).not.toHaveBeenCalled();
  });

  it('redeem() denies once the download cap is reached', async () => {
    const deps = makeDeps();
    deps.deliveries.findTokenByHash.mockResolvedValue({
      id: 'token-1', tenantId: 't1', entitlementId: 'ent-1', digitalFileVersionId: 'ver-1',
      expiresAt: new Date(Date.now() + 3600_000), downloadCount: 5, maxDownloads: 5, allowedIp: null, revokedAt: null,
      entitlement: activeEntitlement, digitalFileVersion: currentVersion,
    });
    const service = makeService(deps);
    const result = await service.redeem('raw-token', '1.2.3.4');
    expect(result).toEqual({ denied: 'DOWNLOAD_CAP_REACHED' });
  });

  it('redeem() denies an IP mismatch when the token is IP-locked', async () => {
    const deps = makeDeps();
    deps.deliveries.findTokenByHash.mockResolvedValue({
      id: 'token-1', tenantId: 't1', entitlementId: 'ent-1', digitalFileVersionId: 'ver-1',
      expiresAt: new Date(Date.now() + 3600_000), downloadCount: 0, maxDownloads: 5, allowedIp: '9.9.9.9', revokedAt: null,
      entitlement: activeEntitlement, digitalFileVersion: currentVersion,
    });
    const service = makeService(deps);
    const result = await service.redeem('raw-token', '1.2.3.4');
    expect(result).toEqual({ denied: 'IP_MISMATCH' });
  });

  it('redeem() succeeds, increments the count, and returns a fresh presigned URL for a valid token', async () => {
    const deps = makeDeps();
    deps.deliveries.findTokenByHash.mockResolvedValue({
      id: 'token-1', tenantId: 't1', entitlementId: 'ent-1', digitalFileVersionId: 'ver-1',
      expiresAt: new Date(Date.now() + 3600_000), downloadCount: 1, maxDownloads: 5, allowedIp: null, revokedAt: null,
      entitlement: activeEntitlement, digitalFileVersion: currentVersion,
    });
    const service = makeService(deps);
    const result = await service.redeem('raw-token', '1.2.3.4');
    expect('url' in result && result.url).toBe('https://signed.example/object');
    expect(deps.deliveries.incrementDownloadCount).toHaveBeenCalledWith('token-1');
    expect(deps.presign.presignGet).toHaveBeenCalledWith(currentVersion.storageKey, 60);
  });

  it('redeem() denies a revoked entitlement', async () => {
    const deps = makeDeps();
    deps.deliveries.findTokenByHash.mockResolvedValue({
      id: 'token-1', tenantId: 't1', entitlementId: 'ent-1', digitalFileVersionId: 'ver-1',
      expiresAt: new Date(Date.now() + 3600_000), downloadCount: 0, maxDownloads: 5, allowedIp: null, revokedAt: null,
      entitlement: { ...activeEntitlement, status: 'REVOKED' }, digitalFileVersion: currentVersion,
    });
    const service = makeService(deps);
    const result = await service.redeem('raw-token', null);
    expect(result).toEqual({ denied: 'ENTITLEMENT_REVOKED' });
  });
});
