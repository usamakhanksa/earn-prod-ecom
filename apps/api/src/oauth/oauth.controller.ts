import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { oauthCallbackQuerySchema, oauthProviderParamSchema, oauthStartQuerySchema } from '@omnisell/shared';
import type { LoginResult } from '../auth/auth.service';
import { AuthService } from '../auth/auth.service';
import { OAuthService } from './oauth.service';

/**
 * Google/Apple OAuth SSO (prompt.md Phase 1.3). See `OAuthService`'s doc comment —
 * every route here is real, documented-endpoint code that answers 501
 * `oauth_provider_not_configured` until real credentials exist (docs/DEBT.md 1-D2).
 */
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
  ) {}

  @Get(':provider/start')
  start(@Param() params: unknown, @Query() query: unknown): { authUrl: string } {
    const { provider } = oauthProviderParamSchema.parse(params);
    const { state } = oauthStartQuerySchema.parse(query);
    const authUrl = this.oauth.buildAuthUrl(provider, state ?? randomUUID());
    return { authUrl };
  }

  @Get('callback/:provider')
  async callback(@Param() params: unknown, @Query() query: unknown, @Req() request: Request): Promise<LoginResult> {
    const { provider } = oauthProviderParamSchema.parse(params);
    const { code, error } = oauthCallbackQuerySchema.parse(query);
    if (error !== undefined) {
      throw new BadRequestException(`${provider} sign-in was cancelled or denied: ${error}`);
    }
    if (code === undefined) {
      throw new BadRequestException('Missing authorization code');
    }
    const profile = await this.oauth.exchangeCode(provider, code);
    const userId = await this.oauth.linkOrCreateUser(provider, profile);
    return this.auth.finishLogin(userId, {
      ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
      ...(request.headers['user-agent'] !== undefined ? { userAgent: request.headers['user-agent'] } : {}),
    });
  }
}
