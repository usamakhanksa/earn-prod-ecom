import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type {
  AuthCtx,
  Ctx,
  Fulfilment,
  FulfilInput,
  HealthResult,
  NormalisedEvent,
  NormalisedOrder,
  Page,
  PublishInput,
  PublishResult,
  RawWebhook,
  TokenSet,
  UpdateInput,
} from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Gumroad adapter (api-registration.md §2.3 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-16 via WebSearch against help.gumroad.com's own API
 * overview and Gumroad's published OAuth scope list:
 *  - Base URL (confirmed): `https://api.gumroad.com/v2`.
 *  - Auth: **OAuth 2.0** (multi-tenant SaaS path, implemented here — same
 *    reasoning Printful's doc comment gives) **or a manually-generated
 *    "application access token" for a user's own account** (Gumroad
 *    Settings → Advanced → Applications, api-registration.md's own
 *    instruction) — both send identically as `Authorization: Bearer <token>`.
 *  - Scopes CONFIRMED by name (help.gumroad.com/docs/api/01-overview):
 *    `view_profile`, `edit_products`, `view_sales` (also required to
 *    subscribe to sales), `view_payouts`, `mark_sales_as_shipped`,
 *    `edit_sales`. Request the minimum, per api-registration.md's own
 *    instruction ("grants broad account access — request narrowly").
 *  - Confirmed endpoints (via WebSearch against Gumroad's own documented
 *    examples): `GET/POST /v2/products`, `GET /v2/sales` (filterable by
 *    `after`/`before`/`email`/`product_id`/`order_id`, paginated via
 *    `page_key`).
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md):
 *  - The OAuth authorize/token endpoint hosts (`gumroad.com/oauth/authorize`,
 *    `api.gumroad.com/oauth/token`) follow Gumroad's long-documented, stable
 *    OAuth pattern from training-time knowledge — a direct fetch of the
 *    authorize URL in this sandbox 404'd (expected: it requires query params
 *    Chrome/a browser would supply, not a docs page), so the literal path
 *    was not re-confirmed via a rendered live page this pass.
 *  - The `{ success, ... }` response envelope shape and the exact
 *    `PUT /v2/products/{id}`, `DELETE /v2/products/{id}`, and
 *    `PUT /v2/sales/{id}/mark_as_shipped` paths follow Gumroad's
 *    long-stable v2 REST conventions and the documented scope names
 *    (`mark_sales_as_shipped`'s own description implies exactly this
 *    endpoint) but were not independently re-verified via a live
 *    authenticated call this pass.
 *  - Gumroad's real-time notification mechanism ("Ping" resource
 *    subscriptions, gated behind `view_sales`) is confirmed to exist by
 *    Gumroad's own scope description, but its exact payload field names in
 *    `handleWebhook` below reflect Gumroad's well-known, stable Ping shape
 *    from training-time knowledge, not a fresh live-docs re-fetch this pass.
 *  - No confirmed endpoint exists for `view_payouts` beyond the scope name
 *    itself — `fetchEarnings` is deliberately NOT implemented
 *    (`canFetchEarnings: false`) rather than guessing a payouts path, the
 *    same discipline Prodigi's doc comment applies to its own gaps.
 *  - No numeric published rate limit was found this pass — the registry
 *    row's `rateLimit` is a conservative estimate, same honesty flag as
 *    3-D7's four.
 */

const AUTHORIZE_URL = 'https://gumroad.com/oauth/authorize';
const TOKEN_URL = 'https://api.gumroad.com/oauth/token';
const BASE_URL = 'https://api.gumroad.com/v2';
const DOCS_URL = 'https://help.gumroad.com/docs/api/01-overview';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: true, // mark_sales_as_shipped scope — see uncertainty note above
  canFetchCost: false, // digital-goods marketplace, not a print-cost catalog provider
  canFetchEarnings: false, // view_payouts scope exists but no endpoint path independently confirmed this pass
  supportsWebhooks: true, // "Ping" resource subscriptions — see uncertainty note above
  supportsSandbox: false,
  ordersMechanism: 'webhook',
};

interface GumroadEnvelope {
  success: boolean;
  message?: string;
}

function authHeaders(ctx: Ctx): Record<string, string> {
  return { authorization: `Bearer ${ctx.accessToken ?? ''}`, 'content-type': 'application/json' };
}

export const gumroadAdapter: ConnectorAdapter = {
  slug: 'gumroad',
  capabilities,

  buildAuthUrl(ctx: AuthCtx): string {
    const params = new URLSearchParams({
      client_id: process.env.GUMROAD_OAUTH_CLIENT_ID ?? '',
      redirect_uri: ctx.redirectUri,
      state: ctx.state,
      response_type: 'code',
      scope: 'view_profile edit_products view_sales mark_sales_as_shipped',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeCode(ctx: AuthCtx, code: string): Promise<TokenSet> {
    const body = await fetchJson<{ access_token: string; refresh_token?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.GUMROAD_OAUTH_CLIENT_ID ?? '',
        client_secret: process.env.GUMROAD_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: ctx.redirectUri,
        code,
      }).toString(),
    });
    return { accessToken: body.access_token, ...(body.refresh_token !== undefined ? { refreshToken: body.refresh_token } : {}) };
  },

  async refresh(_ctx: AuthCtx, tokenSet: TokenSet): Promise<TokenSet> {
    // Gumroad access tokens are documented as long-lived and do not appear to
    // expire on a predictable schedule the way Printful's do — no confirmed
    // refresh-token grant flow was found this pass. Returns the existing
    // token unchanged rather than inventing a refresh call that may not
    // exist; TokenRefreshService (3-D5) will simply see no-op renewal.
    return tokenSet;
  },

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const body = await fetchJson<GumroadEnvelope & { user?: { name?: string; email?: string } }>(
      `${BASE_URL}/user`,
      { headers: authHeaders(ctx) },
    );
    if (!body.success) {
      return { ok: false, accountLabel: null, scopes: [], latencyMs: Date.now() - startedAt, message: body.message ?? 'Gumroad rejected this credential' };
    }
    return {
      ok: true,
      accountLabel: body.user?.name ?? body.user?.email ?? null,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: `Connected to Gumroad account "${body.user?.name ?? body.user?.email ?? 'unknown'}"`,
    };
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toGumroadProductPayload(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const body = await fetchJson<GumroadEnvelope & { product?: { id: string } }>(`${BASE_URL}/products`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify(toGumroadProductPayload(input)),
    });
    if (!body.success || body.product === undefined) {
      throw new Error(body.message ?? 'Gumroad rejected the product create request');
    }
    return { externalId: body.product.id, statusUrl: `${BASE_URL}/products/${body.product.id}` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const body = await fetchJson<GumroadEnvelope & { product?: { id: string } }>(`${BASE_URL}/products/${input.externalId}`, {
      method: 'PUT',
      headers: authHeaders(ctx),
      body: JSON.stringify(toGumroadProductPayload(input)),
    });
    if (!body.success || body.product === undefined) {
      throw new Error(body.message ?? 'Gumroad rejected the product update request');
    }
    return { externalId: body.product.id, statusUrl: `${BASE_URL}/products/${body.product.id}` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await fetchJson<GumroadEnvelope>(`${BASE_URL}/products/${externalId}`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
    });
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const url = cursor !== undefined ? `${BASE_URL}/sales?page_key=${encodeURIComponent(cursor)}` : `${BASE_URL}/sales`;
    const body = await fetchJson<
      GumroadEnvelope & {
        sales?: Array<{
          id: string;
          order_number?: number;
          email?: string;
          full_name?: string;
          product_id: string;
          quantity?: number;
          price: number;
          currency: string;
          created_at: string;
        }>;
        next_page_key?: string | null;
      }
    >(url, { headers: authHeaders(ctx) });
    const sales = body.sales ?? [];
    const items = sales.map((sale) => ({
      externalOrderId: sale.id,
      status: 'paid',
      buyerName: sale.full_name ?? null,
      buyerEmail: sale.email ?? null,
      currency: sale.currency,
      totalMinor: BigInt(sale.price),
      items: [
        {
          externalVariantId: sale.product_id,
          quantity: sale.quantity ?? 1,
          priceMinor: BigInt(sale.price),
          currency: sale.currency,
        },
      ],
      createdAt: sale.created_at,
    }));
    return { items, nextCursor: body.next_page_key ?? null };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    // Gumroad's "Ping" resource-subscription payload (well-known, stable
    // field names) — see uncertainty note above.
    const body = req.body as { sale_id?: string; sale_timestamp?: string; seller_id?: string };
    return [
      {
        type: 'sale',
        externalOrderId: body.sale_id ?? null,
        occurredAt: body.sale_timestamp ?? new Date().toISOString(),
        raw: body,
      },
    ];
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    const body = await fetchJson<GumroadEnvelope>(`${BASE_URL}/sales/${input.externalOrderId}/mark_as_shipped`, {
      method: 'PUT',
      headers: authHeaders(ctx),
    });
    if (!body.success) {
      throw new Error(body.message ?? 'Gumroad rejected mark_as_shipped');
    }
    return { externalFulfilmentId: input.externalOrderId, status: 'SHIPPED', trackingNumber: null, trackingUrl: null, carrier: null };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Gumroad', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Gumroad', error);
  },
};

function toGumroadProductPayload(input: PublishInput): unknown {
  return {
    name: input.title,
    description: input.description,
    price: input.variants[0] !== undefined ? Number(input.variants[0].priceMinor) : 0,
    tags: input.tags,
  };
}
