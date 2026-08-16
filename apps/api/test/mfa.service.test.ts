import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MfaService } from '../src/mfa/mfa.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

function makePrismaMock() {
  return {
    mfaSecret: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    mfaRecoveryCode: { deleteMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function makeAuditMock(): AuditLogService {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
}

describe('MfaService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let audit: AuditLogService;
  let service: MfaService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    audit = makeAuditMock();
    service = new MfaService(prismaMock as never, audit);
  });

  describe('setup', () => {
    it('generates a secret and stores it disabled', async () => {
      prismaMock.mfaSecret.findUnique.mockResolvedValue(null);
      const result = await service.setup('u1', 'owner@demo.test');
      expect(result.secret.length).toBeGreaterThan(0);
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(prismaMock.mfaSecret.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ userId: 'u1', enabled: false }) }),
      );
    });

    it('refuses to re-run setup once MFA is already enabled', async () => {
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', enabled: true, secret: 'X' });
      await expect(service.setup('u1', 'owner@demo.test')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('verifyAndActivate', () => {
    it('activates MFA and issues 10 recovery codes on a correct code', async () => {
      const secret = authenticator.generateSecret();
      const code = authenticator.generate(secret);
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', secret, enabled: false });

      const result = await service.verifyAndActivate('u1', code);
      expect(result.recoveryCodes).toHaveLength(10);
      expect(new Set(result.recoveryCodes).size).toBe(10); // no duplicates
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.enabled' }));
    });

    it('rejects an incorrect code and does not activate MFA', async () => {
      const secret = authenticator.generateSecret();
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', secret, enabled: false });
      await expect(service.verifyAndActivate('u1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects verification before setup has ever run', async () => {
      prismaMock.mfaSecret.findUnique.mockResolvedValue(null);
      await expect(service.verifyAndActivate('u1', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('verifyChallenge', () => {
    it('accepts a valid TOTP code', async () => {
      const secret = authenticator.generateSecret();
      const code = authenticator.generate(secret);
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', secret, enabled: true });
      await expect(service.verifyChallenge('u1', code)).resolves.toBeUndefined();
    });

    it('accepts an unused recovery code exactly once', async () => {
      const secret = authenticator.generateSecret();
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', secret, enabled: true });
      const recoveryCode = 'abcd1234ef';
      const codeHash = createHash('sha256').update(recoveryCode.trim().toLowerCase()).digest('hex');
      prismaMock.mfaRecoveryCode.findFirst.mockResolvedValue({ id: 'rc1', userId: 'u1', codeHash, usedAt: null });

      await service.verifyChallenge('u1', recoveryCode);
      expect(prismaMock.mfaRecoveryCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rc1' }, data: { usedAt: expect.any(Date) } }),
      );
    });

    it('rejects when neither a valid TOTP nor a matching recovery code is presented', async () => {
      const secret = authenticator.generateSecret();
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', secret, enabled: true });
      prismaMock.mfaRecoveryCode.findFirst.mockResolvedValue(null);
      await expect(service.verifyChallenge('u1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when MFA is not enabled', async () => {
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', secret: 'X', enabled: false });
      await expect(service.verifyChallenge('u1', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('disable', () => {
    it('turns MFA off and clears recovery codes', async () => {
      await service.disable('u1');
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.disabled' }));
    });
  });
});
