import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { OrderIngestionService } from './order-ingestion.service';

/**
 * Inbound order webhooks (prompt.md "Webhooks-in POST /hooks/:slug",
 * task 5.1). Deliberately extended to `POST /hooks/:slug/:connectionId`
 * (docs/OPEN_QUESTIONS.md): a webhook must resolve to ONE tenant's ONE
 * connection to decrypt the right credential and verify the right
 * signature — prompt.md's literal `/hooks/:slug` has no tenant/connection
 * discriminator, and the real per-provider setup (e.g. Shopify's per-store
 * webhook subscription, WooCommerce's per-site webhook config) always
 * embeds a per-installation identifier in the callback URL it registers.
 *
 * No `JwtAuthGuard`/`TenantContextGuard` here — the provider calling this
 * endpoint carries no OmniSell session, mirroring the OAuth callback
 * route's identical trust model (docs/OPEN_QUESTIONS.md #27): the
 * `connectionId` path segment plus the HMAC signature check (best-effort —
 * see `OrderIngestionService`'s doc comment on the webhook-secret gap) are
 * the trust anchors instead.
 *
 * HONEST GAP (docs/DEBT.md): this endpoint receives an ALREADY-JSON-PARSED
 * body (Nest's default body parser) rather than the raw request bytes a
 * real HMAC check needs — `JSON.stringify(body)` is used as a stand-in for
 * "the raw body" and will not byte-match the provider's original payload in
 * every case (key ordering/whitespace can differ), so signature
 * verification here is real code but not guaranteed to validate a
 * genuinely correctly-signed real request. A production deployment needs a
 * raw-body-capturing middleware registered ahead of the JSON body parser
 * for this route specifically.
 */
@Controller('hooks')
export class OrderWebhooksController {
  constructor(private readonly ingestion: OrderIngestionService) {}

  @Post(':slug/:connectionId')
  async receive(
    @Param('slug') slug: string,
    @Param('connectionId') connectionId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    // The webhook URL itself doesn't carry a tenantId — real setups mint one
    // callback URL per (tenant, connection); this endpoint resolves the
    // tenant FROM the connection row rather than trusting a caller-supplied
    // tenant header, closing the same "don't trust the caller for identity"
    // gap the OAuth callback closes with its `state` token.
    const tenantId = await this.resolveTenantForConnection(connectionId);
    return this.ingestion.handleWebhook(tenantId, connectionId, slug, headers, JSON.stringify(body ?? {}));
  }

  private async resolveTenantForConnection(connectionId: string): Promise<string> {
    return this.ingestion.resolveTenantIdForConnection(connectionId);
  }
}
