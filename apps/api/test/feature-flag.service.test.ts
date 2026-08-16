import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlagService } from '../src/feature-flags/feature-flag.service';
import type { FeatureFlagTargetRepository } from '../src/repositories/feature-flag-target.repository';
import type { AuditLogService } from '../src/audit/audit-log.service';

function makePrismaMock() {
  return {
    featureFlag: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  };
}

function makeTargetsMock() {
  return {
    listForTenant: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
    remove: vi.fn(),
  };
}

function makeAuditMock(): AuditLogService {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
}

describe('FeatureFlagService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let targetsMock: ReturnType<typeof makeTargetsMock>;
  let audit: AuditLogService;
  let service: FeatureFlagService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    targetsMock = makeTargetsMock();
    audit = makeAuditMock();
    service = new FeatureFlagService(
      prismaMock as never,
      targetsMock as unknown as FeatureFlagTargetRepository,
      audit,
    );
  });

  describe('create', () => {
    it('rejects a duplicate key', async () => {
      prismaMock.featureFlag.findUnique.mockResolvedValue({ id: 'f1', key: 'zatca_einvoicing' });
      await expect(
        service.create({ key: 'zatca_einvoicing', isEnabled: false }, 'admin1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a new flag and audits it', async () => {
      prismaMock.featureFlag.findUnique.mockResolvedValue(null);
      prismaMock.featureFlag.create.mockResolvedValue({
        id: 'f1',
        key: 'new_flag',
        description: null,
        isEnabled: true,
        rolloutPct: null,
      });
      const result = await service.create({ key: 'new_flag', isEnabled: true }, 'admin1');
      expect(result).toEqual({ key: 'new_flag', description: null, enabled: true, source: 'default' });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'feature_flag.created' }));
    });
  });

  describe('listEffectiveForTenant', () => {
    it('reports the tenant override when one exists, otherwise the default', async () => {
      prismaMock.featureFlag.findMany.mockResolvedValue([
        { id: 'f1', key: 'flag_a', description: null, isEnabled: false, rolloutPct: null },
        { id: 'f2', key: 'flag_b', description: null, isEnabled: true, rolloutPct: null },
      ]);
      targetsMock.listForTenant.mockResolvedValue([{ flagId: 'f1', isEnabled: true }]);

      const result = await service.listEffectiveForTenant('t1');
      expect(result).toEqual([
        { key: 'flag_a', description: null, enabled: true, source: 'target' },
        { key: 'flag_b', description: null, enabled: true, source: 'default' },
      ]);
    });
  });

  describe('setTarget — permission boundary', () => {
    it('lets a tenant OWNER/ADMIN target their own tenant', async () => {
      prismaMock.featureFlag.findUnique.mockResolvedValue({ id: 'f1', key: 'flag_a' });
      targetsMock.upsert.mockResolvedValue({ id: 'target1', isEnabled: true });
      await service.setTarget('flag_a', 't1', true, { userId: 'u1', tenantId: 't1', isPlatformAdmin: false });
      expect(targetsMock.upsert).toHaveBeenCalledWith('t1', 'f1', true);
    });

    it('refuses a non-admin targeting a different tenant', async () => {
      await expect(
        service.setTarget('flag_a', 't2', true, { userId: 'u1', tenantId: 't1', isPlatformAdmin: false }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(targetsMock.upsert).not.toHaveBeenCalled();
    });

    it('lets a platform admin target any tenant', async () => {
      prismaMock.featureFlag.findUnique.mockResolvedValue({ id: 'f1', key: 'flag_a' });
      targetsMock.upsert.mockResolvedValue({ id: 'target1', isEnabled: false });
      await service.setTarget('flag_a', 't2', false, { userId: 'admin1', tenantId: 't1', isPlatformAdmin: true });
      expect(targetsMock.upsert).toHaveBeenCalledWith('t2', 'f1', false);
    });

    it('404s targeting an unknown flag', async () => {
      prismaMock.featureFlag.findUnique.mockResolvedValue(null);
      await expect(
        service.setTarget('missing', 't1', true, { userId: 'u1', tenantId: 't1', isPlatformAdmin: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
