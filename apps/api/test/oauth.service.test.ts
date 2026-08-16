import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OAuthService } from '../src/oauth/oauth.service';

/**
 * docs/DEBT.md 1-D2 — no real Google/Apple credentials exist in this environment
 * and none are invented. Every call must fail loudly and honestly (501
 * oauth_provider_not_configured) rather than crash or fake a session, because the
 * env schema (apps/api/src/config/env.ts) leaves the GOOGLE_ and APPLE_ vars undefined.
 */
describe('OAuthService (no credentials configured)', () => {
  const service = new OAuthService({} as never);

  it('reports both providers as not configured', () => {
    expect(service.isConfigured('GOOGLE')).toBe(false);
    expect(service.isConfigured('APPLE')).toBe(false);
  });

  it('buildAuthUrl throws a 501 problem with a machine-readable code', () => {
    try {
      service.buildAuthUrl('GOOGLE', 'state-123');
      throw new Error('expected buildAuthUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(501);
      expect((httpError.getResponse() as { code?: string }).code).toBe('oauth_provider_not_configured');
    }
  });

  it('exchangeCode throws the same 501 problem before making any network call', async () => {
    try {
      await service.exchangeCode('APPLE', 'some-code');
      throw new Error('expected exchangeCode to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(501);
      expect((httpError.getResponse() as { code?: string }).code).toBe('oauth_provider_not_configured');
    }
  });
});
