import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { connectorOAuthCallbackQuerySchema } from '@omnisell/shared';
import { ConnectionsService } from './connections.service';
import { env } from '../config/env';

/**
 * Provider-side OAuth 2.0 + PKCE callback (prompt.md API surface:
 * `GET /oauth/callback/:slug`). Deliberately has NO `JwtAuthGuard` — this
 * route is reached by a full-page browser redirect FROM the provider (e.g.
 * Printful), which carries no OmniSell session header, only `code`/`state`/
 * `error` query params. Security instead comes from the single-use, time-
 * limited `state` token minted by `ConnectionsService.startOAuth` while the
 * caller WAS authenticated — the same trust model Phase 1's SSO callback
 * (`apps/api/src/oauth/oauth.controller.ts`) uses for the exact same reason.
 * This is a distinct route from that one: it authorises a *connector* for an
 * already-known tenant/connection, not a person signing in.
 */
@Controller('oauth')
export class ConnectorOAuthCallbackController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get('callback/:slug')
  async callback(@Param('slug') slug: string, @Query() query: unknown, @Res() res: Response): Promise<void> {
    const { code, state, error } = connectorOAuthCallbackQuerySchema.parse(query);
    try {
      const connection = await this.connections.handleOAuthCallback(slug, code, state, error);
      res.redirect(`${env.APP_URL}/channels/connections/${connection.id}?oauth=success`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'OAuth callback failed';
      res.redirect(`${env.APP_URL}/channels/connections?oauth=error&message=${encodeURIComponent(message)}`);
    }
  }
}
