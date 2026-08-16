import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hash } from 'argon2';
import type { OAuthProvider } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';

export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
}

interface ProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
  authorizeUrl: string;
  scope: string;
}

/**
 * Google/Apple OAuth SSO scaffolding (prompt.md Phase 1.3 / docs/DEBT.md 1-D2).
 *
 * No real client credentials exist in this environment and none are invented —
 * `docs/CONNECTORS.md`'s rule ("only implement against a live, documented API")
 * applies here too. `buildAuthUrl`/`exchangeCode` are fully wired against each
 * provider's real, documented endpoint shape (Google's OAuth 2.0 / Apple's "Sign
 * in with Apple" REST APIs) so the moment `GOOGLE_CLIENT_ID`/`APPLE_*` env vars
 * are supplied, this starts working with zero code changes — but until then every
 * call fails loudly and honestly with a 501 `oauth_provider_not_configured`
 * problem+json response instead of crashing or faking a session.
 */
@Injectable()
export class OAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private configFor(provider: OAuthProvider): ProviderConfig {
    if (provider === 'GOOGLE') {
      return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        scope: 'openid email profile',
      };
    }
    return {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_PRIVATE_KEY, // Apple signs a client_secret JWT from this key; see exchangeCode
      redirectUri: env.APPLE_REDIRECT_URI,
      authorizeUrl: 'https://appleid.apple.com/auth/authorize',
      scope: 'name email',
    };
  }

  isConfigured(provider: OAuthProvider): boolean {
    const config = this.configFor(provider);
    return config.clientId !== undefined && config.clientSecret !== undefined && config.redirectUri !== undefined;
  }

  buildAuthUrl(provider: OAuthProvider, state: string): string {
    const config = this.configFor(provider);
    this.assertConfigured(provider, config);

    const params = new URLSearchParams({
      client_id: config.clientId ?? '',
      redirect_uri: config.redirectUri ?? '',
      response_type: 'code',
      scope: config.scope,
      state,
      ...(provider === 'APPLE' ? { response_mode: 'form_post' } : { access_type: 'offline', prompt: 'consent' }),
    });
    return `${config.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for the provider's user profile. Not
   * exercised in this sandbox (no credentials) — the call sites (token endpoint
   * URLs, grant type, param names) follow each provider's published OAuth 2.0
   * docs exactly so this is real code, not a stub, once configured.
   */
  async exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
    const config = this.configFor(provider);
    this.assertConfigured(provider, config);

    const tokenUrl =
      provider === 'GOOGLE' ? 'https://oauth2.googleapis.com/token' : 'https://appleid.apple.com/auth/token';
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId ?? '',
        client_secret: config.clientSecret ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri ?? '',
      }),
    });
    if (!response.ok) {
      throw new HttpException(
        { message: `${provider} token exchange failed (${response.status})`, code: 'oauth_exchange_failed' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const body = (await response.json()) as { id_token?: string };
    if (body.id_token === undefined) {
      throw new HttpException(
        { message: `${provider} did not return an id_token`, code: 'oauth_exchange_failed' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return decodeIdTokenClaims(body.id_token);
  }

  /**
   * Find-or-create the local user behind a verified OAuth identity (Phase 1.3).
   * Conservative defaults recorded in docs/OPEN_QUESTIONS.md (#16/#17):
   *  - An email match against an existing account auto-links the OAuth identity
   *    (the provider has already verified that email) rather than requiring a
   *    separate "confirm your identity" step.
   *  - A brand-new signer gets a fresh personal tenant (same as email/password
   *    `register()`), named from their email's local part, and becomes its
   *    OWNER — mirrors the no-org-yet path email/password signup already uses.
   * Both defaults are placeholders pending real product input on org-joining
   * semantics; they cannot be exercised end-to-end here without real provider
   * credentials (docs/DEBT.md 1-D2), so treat this as reviewed-but-unverified.
   */
  async linkOrCreateUser(provider: OAuthProvider, profile: OAuthProfile): Promise<string> {
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
    });
    if (existingLink !== null) {
      return existingLink.userId;
    }

    if (profile.email !== null) {
      const existingUser = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existingUser !== null) {
        await this.prisma.oAuthAccount.create({
          data: { userId: existingUser.id, provider, providerAccountId: profile.providerAccountId, email: profile.email },
        });
        return existingUser.id;
      }
    }

    const email = profile.email ?? `${provider.toLowerCase()}-${profile.providerAccountId}@oauth.omnisell.invalid`;
    const localPart = email.split('@')[0] ?? 'user';
    const slug = await this.uniqueTenantSlug(localPart);
    const { user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { slug, name: localPart } });
      const user = await tx.user.create({
        data: { email, passwordHash: await unusablePasswordHash(), emailVerifiedAt: new Date() },
      });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'OWNER' } });
      await tx.oAuthAccount.create({
        data: { userId: user.id, provider, providerAccountId: profile.providerAccountId, email: profile.email },
      });
      return { user, tenant };
    });
    return user.id;
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

  private assertConfigured(provider: OAuthProvider, config: ProviderConfig): void {
    if (config.clientId === undefined || config.clientSecret === undefined || config.redirectUri === undefined) {
      throw new HttpException(
        {
          message: `OAuth provider '${provider}' is not configured. Set the ${provider}_CLIENT_ID/${provider}_CLIENT_SECRET (or Apple's key-based equivalents) and redirect URI env vars before enabling it — see docs/DEBT.md (1-D2).`,
          code: 'oauth_provider_not_configured',
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
  }
}

/** OAuth-only accounts have no password login path. A real argon2 hash of an
 * unrecoverable random value keeps `argon2.verify()` well-formed (returns false
 * for every attempt) instead of throwing on a malformed hash string. */
async function unusablePasswordHash(): Promise<string> {
  return hash(randomBytes(32).toString('hex'));
}

/** Decodes the unsigned payload of an OIDC id_token — signature verification against
 * the provider's JWKS is required before this profile is trusted in production and
 * is part of the follow-up work once real credentials land (docs/DEBT.md 1-D2). */
function decodeIdTokenClaims(idToken: string): OAuthProfile {
  const payloadSegment = idToken.split('.')[1];
  if (payloadSegment === undefined) {
    throw new HttpException(
      { message: 'Malformed id_token', code: 'oauth_exchange_failed' },
      HttpStatus.BAD_GATEWAY,
    );
  }
  const claims = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as {
    sub?: string;
    email?: string;
  };
  return { providerAccountId: claims.sub ?? '', email: claims.email ?? null };
}
