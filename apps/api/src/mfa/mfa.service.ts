import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { env } from '../config/env';

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
}

export interface MfaVerifyResult {
  recoveryCodes: string[];
}

const RECOVERY_CODE_COUNT = 10;

/**
 * TOTP MFA (prompt.md Phase 1.3 / featureslist.md 1.4 — 10 recovery codes).
 *
 * `setup()` generates and stores a secret but never enables MFA on its own —
 * `verifyAndActivate()` proves the user actually configured their authenticator
 * app correctly before MFA starts gating login. Recovery codes are shown to the
 * user exactly once (the return value of `verifyAndActivate`) and stored only as
 * a sha256 hash, mirroring how refresh tokens are stored in `AuthService`.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async setup(userId: string, email: string): Promise<MfaSetupResult> {
    const existing = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (existing?.enabled === true) {
      throw new ConflictException('MFA is already enabled for this account');
    }

    const secret = authenticator.generateSecret();
    await this.prisma.mfaSecret.upsert({
      where: { userId },
      update: { secret, enabled: false },
      create: { userId, secret, enabled: false },
    });

    return { secret, otpauthUrl: authenticator.keyuri(email, env.MFA_ISSUER, secret) };
  }

  async verifyAndActivate(userId: string, code: string, ipAddress?: string | null): Promise<MfaVerifyResult> {
    const record = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (record === null) {
      throw new UnauthorizedException('Run MFA setup before verifying a code');
    }
    if (!authenticator.check(code, record.secret)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.mfaSecret.update({ where: { userId }, data: { enabled: true } }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({ userId, codeHash: hashRecoveryCode(recoveryCode) })),
      }),
    ]);

    await this.audit.record({
      actorId: userId,
      action: 'mfa.enabled',
      entityType: 'MfaSecret',
      entityId: userId,
      ipAddress: ipAddress ?? null,
    });

    return { recoveryCodes };
  }

  async isEnabled(userId: string): Promise<boolean> {
    const record = await this.prisma.mfaSecret.findUnique({ where: { userId }, select: { enabled: true } });
    return record?.enabled ?? false;
  }

  /** TOTP code OR a single-use recovery code — the login MFA challenge step. */
  async verifyChallenge(userId: string, code: string): Promise<void> {
    const record = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (record === null || !record.enabled) {
      throw new UnauthorizedException('MFA is not enabled for this account');
    }
    if (authenticator.check(code, record.secret)) {
      return;
    }
    const redeemed = await this.redeemRecoveryCode(userId, code);
    if (!redeemed) {
      throw new UnauthorizedException('Invalid authentication code');
    }
  }

  async disable(userId: string, ipAddress?: string | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mfaSecret.update({ where: { userId }, data: { enabled: false } }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    ]);
    await this.audit.record({
      actorId: userId,
      action: 'mfa.disabled',
      entityType: 'MfaSecret',
      entityId: userId,
      ipAddress: ipAddress ?? null,
    });
  }

  private async redeemRecoveryCode(userId: string, code: string): Promise<boolean> {
    const codeHash = hashRecoveryCode(code);
    const record = await this.prisma.mfaRecoveryCode.findFirst({
      where: { userId, codeHash, usedAt: null },
    });
    if (record === null) {
      return false;
    }
    await this.prisma.mfaRecoveryCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await this.audit.record({
      actorId: userId,
      action: 'mfa.recovery_code_redeemed',
      entityType: 'MfaRecoveryCode',
      entityId: record.id,
    });
    return true;
  }
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(5).toString('hex'));
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}
