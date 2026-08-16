import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, createHash } from 'node:crypto';
import { hash, verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { MfaService } from '../mfa/mfa.service';
import { env } from '../config/env';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Returned instead of tokens when the account has TOTP MFA enabled (Phase 1.3). */
export interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
}

export type LoginResult = AuthTokens | MfaChallengeResponse;

export function isMfaChallenge(result: LoginResult): result is MfaChallengeResponse {
  return 'challengeToken' in result;
}

interface MfaChallengePayload {
  sub: string;
  mfaPending: true;
}

export interface AuthedContext {
  userId: string;
  tenantId: string;
  role: string;
}

export interface DeviceInfo {
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionSummary {
  id: string;
  deviceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 min (prompt.md)
const REFRESH_TOKEN_TTL_DAYS = 30; // rotating refresh, 30 d

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly mfa: MfaService,
  ) {}

  async login(email: string, password: string, device?: DeviceInfo): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user === null) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.finishLogin(user.id, device);
  }

  /**
   * Shared tail of every login path (password, OAuth) once the caller's identity
   * is already established: gate on MFA, then issue tokens. Public because
   * `OAuthController` (Phase 1.3) needs it after a successful provider exchange —
   * OAuth logins go through the same MFA challenge as password logins.
   */
  async finishLogin(userId: string, device?: DeviceInfo): Promise<LoginResult> {
    const mfaEnabled = await this.mfa.isEnabled(userId);
    if (mfaEnabled) {
      return this.issueMfaChallenge(userId);
    }
    return this.issueTokens(userId, device);
  }

  /** Step 2 of MFA login (prompt.md Phase 1.3): exchange a short-lived challenge
   * token + a TOTP/recovery code for real tokens. */
  async completeMfaChallenge(challengeToken: string, code: string, device?: DeviceInfo): Promise<AuthTokens> {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(challengeToken, { secret: env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }
    if (payload.mfaPending !== true) {
      throw new UnauthorizedException('Invalid MFA challenge token');
    }
    await this.mfa.verifyChallenge(payload.sub, code);
    return this.issueTokens(payload.sub, device);
  }

  private async issueMfaChallenge(userId: string): Promise<MfaChallengeResponse> {
    const expiresIn = env.MFA_CHALLENGE_TTL_MINUTES * 60;
    const challengeToken = await this.jwt.signAsync(
      { sub: userId, mfaPending: true },
      { secret: env.JWT_ACCESS_SECRET, expiresIn },
    );
    return { mfaRequired: true, challengeToken, expiresIn };
  }

  /** Sign-up creates the caller's own org (they become its OWNER) — prompt.md Phase 1.1. */
  async register(
    input: { email: string; password: string; name?: string | undefined; orgName: string },
    device?: DeviceInfo,
  ): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing !== null) {
      throw new UnauthorizedException('Email already registered');
    }

    const passwordHash = await hash(input.password);
    const slug = await this.uniqueTenantSlug(input.orgName);

    const { user, tenant } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { slug, name: input.orgName } });
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name ?? null },
      });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'OWNER' } });
      return { user, tenant };
    });

    await this.issueEmailVerification(user.id, user.email);
    await this.prisma.auditLog.create({
      data: { tenantId: tenant.id, actorId: user.id, action: 'user.register', entityType: 'User', entityId: user.id },
    });

    return this.issueTokens(user.id, device);
  }

  async refresh(refreshToken: string, device?: DeviceInfo): Promise<AuthTokens> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
    if (session === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (session.revokedAt !== null) {
      // Reuse of an already-rotated/revoked refresh token — treat as theft: kill
      // every session for this user rather than trust the presented token again.
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'session.reuse_detected',
          entityType: 'Session',
          entityId: session.id,
          ipAddress: device?.ipAddress ?? null,
        },
      });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(session.userId, device);
  }

  async listSessions(userId: string): Promise<SessionSummary[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, deviceId: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (session === null || session.userId !== userId) {
      throw new UnauthorizedException('Session not found');
    }
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (record === null || record.consumedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    ]);
  }

  /** Always resolves (never reveals whether the email is registered). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user === null) {
      return;
    }
    const token = randomUUID();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: addMinutes(new Date(), env.PASSWORD_RESET_TOKEN_TTL_MINUTES),
      },
    });
    const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your OmniSell password',
      text: `Reset your password: ${resetUrl}`,
      html: `<p><a href="${resetUrl}">Reset your password</a></p>`,
    });
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (record === null || record.consumedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.prisma.auditLog.create({
      data: { actorId: record.userId, action: 'user.password_reset', entityType: 'User', entityId: record.userId },
    });
  }

  /** Resolve the active tenant + role for a user; `requestedTenantId` powers the org switcher (Phase 1.6). */
  async resolveContext(userId: string, requestedTenantId?: string): Promise<AuthedContext> {
    const membership = await this.prisma.membership.findFirst({
      where: requestedTenantId
        ? { userId, isActive: true, tenantId: requestedTenantId }
        : { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (membership === null) {
      throw new UnauthorizedException(
        requestedTenantId ? 'No active membership in the requested tenant' : 'No active membership',
      );
    }
    return { userId, tenantId: membership.tenantId, role: membership.role };
  }

  async getAuthedUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, locale: true, emailVerifiedAt: true, isPlatformAdmin: true },
    });
  }

  private async issueEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomUUID();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: addHours(new Date(), env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS),
      },
    });
    const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`;
    await this.mailer.send({
      to: email,
      subject: 'Verify your OmniSell email',
      text: `Verify your email: ${verifyUrl}`,
      html: `<p><a href="${verifyUrl}">Verify your email</a></p>`,
    });
  }

  private async uniqueTenantSlug(name: string): Promise<string> {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
    let slug = base;
    let suffix = 0;
    while ((await this.prisma.tenant.findUnique({ where: { slug } })) !== null) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    return slug;
  }

  private async issueTokens(userId: string, device?: DeviceInfo): Promise<AuthTokens> {
    const refreshToken = randomUUID();
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hashToken(refreshToken),
        deviceId: device?.deviceId ?? null,
        ipAddress: device?.ipAddress ?? null,
        userAgent: device?.userAgent ?? null,
        expiresAt: addDays(new Date(), REFRESH_TOKEN_TTL_DAYS),
      },
    });
    const payload = { sub: userId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setUTCHours(result.getUTCHours() + hours);
  return result;
}

function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setUTCMinutes(result.getUTCMinutes() + minutes);
  return result;
}
