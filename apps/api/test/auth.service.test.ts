import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, type AuthTokens } from '../src/auth/auth.service';
import type { MailerService } from '../src/mailer/mailer.service';
import type { MfaService } from '../src/mfa/mfa.service';

function makePrismaMock() {
  const txMock = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn(), update: vi.fn() },
    membership: { create: vi.fn() },
    emailVerificationToken: { update: vi.fn() },
    passwordResetToken: { update: vi.fn() },
    session: { updateMany: vi.fn() },
  };
  return {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    tenant: { create: vi.fn(), findUnique: vi.fn() },
    membership: { findFirst: vi.fn(), create: vi.fn() },
    session: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    emailVerificationToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    // No test in this file enables MFA, so every login resolves as a normal
    // (non-challenge) login unless a specific test overrides this mock.
    mfaSecret: { findUnique: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof txMock) => unknown)(txMock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    _tx: txMock,
  };
}

function makeMailerMock(): MailerService {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as MailerService;
}

/** Delegates to the real `mfaSecret` prisma mock so both "layers" of the MFA
 * mock stay in sync — a test only needs to set `prismaMock.mfaSecret.findUnique`. */
function makeMfaServiceMock(prismaMock: ReturnType<typeof makePrismaMock>): MfaService {
  return {
    isEnabled: vi.fn(async (userId: string) => {
      const record = (await prismaMock.mfaSecret.findUnique({ where: { userId } })) as { enabled?: boolean } | null;
      return record?.enabled ?? false;
    }),
    verifyChallenge: vi.fn().mockResolvedValue(undefined),
  } as unknown as MfaService;
}

const jwt = new JwtService({ secret: 'test-secret-for-32-bytes-000000000000' });

describe('AuthService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let mailer: MailerService;
  let mfa: MfaService;
  let service: AuthService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    mailer = makeMailerMock();
    mfa = makeMfaServiceMock(prismaMock);
    service = new AuthService(prismaMock as never, jwt, mailer, mfa);
  });

  describe('login', () => {
    it('rejects a login with an unknown email', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.login('nobody@demo.test', 'Demo!2345')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a login with a wrong password', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hash('correct-horse') });
      await expect(service.login('owner@demo.test', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues access + refresh tokens on a valid login', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hash('Demo!2345') });
      prismaMock.session.create.mockResolvedValue({ id: 's1' });

      const tokens = (await service.login('owner@demo.test', 'Demo!2345')) as AuthTokens;
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(tokens.refreshToken.length).toBeGreaterThan(0);
      expect(tokens.expiresIn).toBe(900);
      // Refresh token is hashed before storage — never stored in plaintext.
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) }),
      );
    });

    it('returns an MFA challenge instead of tokens when MFA is enabled', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hash('Demo!2345') });
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', enabled: true });

      const result = await service.login('owner@demo.test', 'Demo!2345');
      expect(result).toEqual(
        expect.objectContaining({ mfaRequired: true, challengeToken: expect.any(String) }),
      );
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });
  });

  describe('completeMfaChallenge', () => {
    it('exchanges a valid challenge token + code for real tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hash('Demo!2345') });
      prismaMock.mfaSecret.findUnique.mockResolvedValue({ userId: 'u1', enabled: true });
      prismaMock.session.create.mockResolvedValue({ id: 's1' });

      const challenge = await service.login('owner@demo.test', 'Demo!2345');
      if (!('challengeToken' in challenge)) {
        throw new Error('expected an MFA challenge');
      }

      const tokens = await service.completeMfaChallenge(challenge.challengeToken, '123456');
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(mfa.verifyChallenge).toHaveBeenCalledWith('u1', '123456');
    });

    it('rejects a garbage challenge token', async () => {
      await expect(service.completeMfaChallenge('not-a-real-jwt', '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    it('rejects when the email is already registered', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({ email: 'owner@demo.test', password: 'Demo!2345', orgName: 'Demo Co' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('creates a tenant + OWNER membership, sends a verification email, and issues tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null); // no existing user
      prismaMock.tenant.findUnique.mockResolvedValue(null); // slug is free
      prismaMock._tx.tenant.create.mockResolvedValue({ id: 't1', slug: 'demo-co' });
      prismaMock._tx.user.create.mockResolvedValue({ id: 'u1', email: 'owner@demo.test' });
      prismaMock.session.create.mockResolvedValue({ id: 's1' });

      const tokens = await service.register({ email: 'owner@demo.test', password: 'Demo!2345', orgName: 'Demo Co' });

      expect(prismaMock._tx.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'demo-co', name: 'Demo Co' }) }),
      );
      expect(prismaMock._tx.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 't1', userId: 'u1', role: 'OWNER' }) }),
      );
      expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@demo.test' }));
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'user.register' }) }),
      );
      expect(tokens.accessToken.length).toBeGreaterThan(0);
    });
  });

  describe('refresh — reuse detection', () => {
    it('rotates a valid, un-revoked refresh token', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      prismaMock.session.create.mockResolvedValue({ id: 's2' });

      await service.refresh('some-refresh-token');

      expect(prismaMock.session.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { revokedAt: expect.any(Date) } });
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('treats a reused (already-revoked) refresh token as theft and kills every session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(service.refresh('stolen-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'session.reuse_detected' }) }),
      );
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown refresh token', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      await expect(service.refresh('unknown-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('email verification & password reset', () => {
    it('verifies email with a valid, unconsumed token', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'ev1',
        userId: 'u1',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      });
      await service.verifyEmail('good-token');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { emailVerifiedAt: expect.any(Date) } }),
      );
    });

    it('rejects an expired email verification token', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'ev1',
        userId: 'u1',
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('expired-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not leak whether an email is registered on password-reset request', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.requestPasswordReset('nobody@demo.test')).resolves.toBeUndefined();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('sends a reset email for a known address', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'owner@demo.test' });
      await service.requestPasswordReset('owner@demo.test');
      expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@demo.test' }));
    });

    it('confirms a password reset and revokes every session', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'pr1',
        userId: 'u1',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      });
      await service.confirmPasswordReset('good-token', 'NewPassword!234');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
    });
  });

  describe('resolveContext', () => {
    it('resolves the active tenant + role from a membership', async () => {
      prismaMock.membership.findFirst.mockResolvedValue({ tenantId: 't1', role: 'OWNER' });
      const ctx = await service.resolveContext('u1');
      expect(ctx).toEqual({ userId: 'u1', tenantId: 't1', role: 'OWNER' });
    });

    it('honours a requested tenant id (org switcher)', async () => {
      prismaMock.membership.findFirst.mockResolvedValue({ tenantId: 't2', role: 'MEMBER' });
      const ctx = await service.resolveContext('u1', 't2');
      expect(prismaMock.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 't2' }) }),
      );
      expect(ctx.tenantId).toBe('t2');
    });

    it('rejects a requested tenant the caller has no active membership in', async () => {
      prismaMock.membership.findFirst.mockResolvedValue(null);
      await expect(service.resolveContext('u1', 't-other')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('sessions', () => {
    it('lists only the caller own live sessions', async () => {
      prismaMock.session.findMany.mockResolvedValue([{ id: 's1' }]);
      const sessions = await service.listSessions('u1');
      expect(sessions).toEqual([{ id: 's1' }]);
      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', revokedAt: null }) }),
      );
    });

    it('refuses to revoke a session belonging to another user', async () => {
      prismaMock.session.findUnique.mockResolvedValue({ id: 's1', userId: 'someone-else' });
      await expect(service.revokeSession('u1', 's1')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes the caller own session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      await service.revokeSession('u1', 's1');
      expect(prismaMock.session.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { revokedAt: expect.any(Date) } });
    });
  });
});
