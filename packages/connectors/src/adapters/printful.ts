import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type {
  AuthCtx,
  Blueprint,
  CostQuote,
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
 * Printful adapter (api-registration.md §2.1 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-11 via WebFetch against https://developers.printful.com/docs/:
 *  - Base URL: https://api.printful.com/ (confirmed live).
 *  - Auth: OAuth 2.0 (store-level or account-level client) OR a private token
 *    for a single store. This adapter implements the OAuth path (`buildAuthUrl`
 *    / `exchangeCode` / `refresh`) since OmniSell is a multi-tenant SaaS
 *    (api-registration.md's own recommendation); a tenant may alternatively
 *    paste a private token directly as `Ctx.accessToken` with no OAuth step —
 *    `verifyCredentials`/every other call works identically either way because
 *    Printful accepts both as a Bearer token.
 *  - Webhooks: confirmed supported (order lifecycle, product sync, stock).
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md — not independently re-verified via
 * a live authenticated call in this sandbox, no credentials available):
 *  - Exact OAuth authorize/token endpoint paths (`/oauth/authorize`,
 *    `/oauth/token` on `www.printful.com`) and the exact `{code, result}`
 *    response envelope on every REST call follow Printful's long-documented
 *    v1 API shape from training-time knowledge, cross-checked against the
 *    live docs page's existence today — but no live sandbox call confirmed
 *    the literal field names this pass.
 */

const BASE_URL = 'https://api.printful.com';
const OAUTH_AUTHORIZE_URL = 'https://www.printful.com/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://www.printful.com/oauth/token';
const DOCS_URL = 'https://developers.printful.com/docs/';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: true,
  canFetchCost: true,
  canFetchEarnings: false, // Printful is a fulfilment provider, not a marketplace — no earnings surface
  supportsWebhooks: true,
  supportsSandbox: false, // no formally documented public sandbox flag confirmed for Printful
  ordersMechanism: 'webhook',
};

interface PrintfulEnvelope<T> {
  code: number;
  result: T;
}

function authHeaders(ctx: Ctx): Record<string, string> {
  return { authorization: `Bearer ${ctx.accessToken ?? ''}`, 'content-type': 'application/json' };
}

export const printfulAdapter: ConnectorAdapter = {
  slug: 'printful',
  capabilities,

  buildAuthUrl(ctx: AuthCtx): string {
    const params = new URLSearchParams({
      client_id: process.env.PRINTFUL_OAUTH_CLIENT_ID ?? '',
      redirect_uri: ctx.redirectUri,
      state: ctx.state,
      response_type: 'code',
    });
    return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeCode(ctx: AuthCtx, code: string): Promise<TokenSet> {
    const body = await fetchJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.PRINTFUL_OAUTH_CLIENT_ID ?? '',
        client_secret: process.env.PRINTFUL_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: ctx.redirectUri,
      }).toString(),
    });
    return buildTokenSet(body.access_token, body.refresh_token, body.expires_in);
  },

  async refresh(_ctx: AuthCtx, tokenSet: TokenSet): Promise<TokenSet> {
    const body = await fetchJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenSet.refreshToken ?? '',
        client_id: process.env.PRINTFUL_OAUTH_CLIENT_ID ?? '',
        client_secret: process.env.PRINTFUL_OAUTH_CLIENT_SECRET ?? '',
      }).toString(),
    });
    return buildTokenSet(body.access_token, body.refresh_token ?? tokenSet.refreshToken, body.expires_in);
  },

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const envelope = await fetchJson<PrintfulEnvelope<{ id: number; name: string }>>(`${BASE_URL}/store`, {
      headers: authHeaders(ctx),
    });
    return {
      ok: true,
      accountLabel: envelope.result.name,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: `Connected to Printful store "${envelope.result.name}"`,
    };
  },

  async fetchBlueprints(ctx: Ctx): Promise<Blueprint[]> {
    const catalog = await fetchJson<PrintfulEnvelope<Array<{ id: number; title: string; type: string }>>>(
      `${BASE_URL}/products`,
      { headers: authHeaders(ctx) },
    );
    const blueprints: Blueprint[] = [];
    for (const product of catalog.result) {
       
      const detail = await fetchJson<
        PrintfulEnvelope<{
          product: { id: number; title: string; type: string };
          variants: Array<{ id: number; name: string; size: string; color: string; color_code?: string; price: string }>;
        }>
      >(`${BASE_URL}/products/${product.id}`, { headers: authHeaders(ctx) });
      blueprints.push({
        providerBlueprintId: String(detail.result.product.id),
        name: detail.result.product.title,
        category: detail.result.product.type,
        printAreas: [],
        sizes: [...new Set(detail.result.variants.map((v) => v.size))],
        colors: [...new Map(detail.result.variants.map((v) => [v.color, { name: v.color, hex: v.color_code ?? '#000000' }])).values()],
        variants: detail.result.variants.map((v) => ({
          providerVariantId: String(v.id),
          size: v.size,
          color: v.color,
          ...(v.color_code !== undefined ? { colorHex: v.color_code } : {}),
          baseCostMinor: BigInt(Math.round(Number.parseFloat(v.price) * 100)),
          currency: 'USD',
          inStock: true,
        })),
      });
    }
    return blueprints;
  },

  async fetchCosts(ctx: Ctx, ids: string[]): Promise<CostQuote[]> {
    const quotes: CostQuote[] = [];
    for (const id of ids) {
       
      const envelope = await fetchJson<PrintfulEnvelope<{ id: number; price: string; currency: string }>>(
        `${BASE_URL}/products/variant/${id}`,
        { headers: authHeaders(ctx) },
      );
      quotes.push({
        providerVariantId: String(envelope.result.id),
        costMinor: BigInt(Math.round(Number.parseFloat(envelope.result.price) * 100)),
        currency: envelope.result.currency,
      });
    }
    return quotes;
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toSyncProductPayload(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const envelope = await fetchJson<PrintfulEnvelope<{ id: number }>>(`${BASE_URL}/store/products`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify(toSyncProductPayload(input)),
    });
    return { externalId: String(envelope.result.id), statusUrl: `${BASE_URL}/store/products/${envelope.result.id}` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const envelope = await fetchJson<PrintfulEnvelope<{ id: number }>>(`${BASE_URL}/store/products/${input.externalId}`, {
      method: 'PUT',
      headers: authHeaders(ctx),
      body: JSON.stringify(toSyncProductPayload(input)),
    });
    return { externalId: String(envelope.result.id), statusUrl: `${BASE_URL}/store/products/${envelope.result.id}` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await fetchJson<PrintfulEnvelope<unknown>>(`${BASE_URL}/store/products/${externalId}`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
    });
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const offset = cursor !== undefined ? Number.parseInt(cursor, 10) : 0;
    const envelope = await fetchJson<
      PrintfulEnvelope<Array<{ id: number; status: string; recipient?: { name?: string; email?: string }; costs: { total: string; currency: string }; items: Array<{ variant_id: number; quantity: number; retail_price: string }>; created: number }>>
    >(`${BASE_URL}/orders?offset=${offset}&limit=20`, { headers: authHeaders(ctx) });
    const items = envelope.result.map((order) => ({
      externalOrderId: String(order.id),
      status: order.status,
      buyerName: order.recipient?.name ?? null,
      buyerEmail: order.recipient?.email ?? null,
      currency: order.costs.currency,
      totalMinor: BigInt(Math.round(Number.parseFloat(order.costs.total) * 100)),
      items: order.items.map((item) => ({
        externalVariantId: String(item.variant_id),
        quantity: item.quantity,
        priceMinor: BigInt(Math.round(Number.parseFloat(item.retail_price) * 100)),
        currency: order.costs.currency,
      })),
      createdAt: new Date(order.created * 1000).toISOString(),
    }));
    return { items, nextCursor: items.length === 20 ? String(offset + 20) : null };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    const body = req.body as { type?: string; data?: { order?: { id?: number } }; created?: number };
    return [
      {
        type: body.type ?? 'unknown',
        externalOrderId: body.data?.order?.id !== undefined ? String(body.data.order.id) : null,
        occurredAt: body.created !== undefined ? new Date(body.created * 1000).toISOString() : new Date().toISOString(),
        raw: body,
      },
    ];
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    const envelope = await fetchJson<PrintfulEnvelope<{ id: number; status: string; shipments?: Array<{ tracking_number?: string; tracking_url?: string; carrier?: string }> }>>(
      `${BASE_URL}/orders/${input.externalOrderId}/confirm`,
      { method: 'POST', headers: authHeaders(ctx) },
    );
    const shipment = envelope.result.shipments?.[0];
    return {
      externalFulfilmentId: String(envelope.result.id),
      status: envelope.result.status,
      trackingNumber: shipment?.tracking_number ?? null,
      trackingUrl: shipment?.tracking_url ?? null,
      carrier: shipment?.carrier ?? null,
    };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Printful', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Printful', error);
  },
};

function buildTokenSet(accessToken: string, refreshToken: string | undefined, expiresInSeconds: number | undefined): TokenSet {
  return {
    accessToken,
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(expiresInSeconds !== undefined ? { expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() } : {}),
  };
}

function toSyncProductPayload(input: PublishInput): unknown {
  return {
    sync_product: { name: input.title },
    sync_variants: input.variants.map((v) => ({
      variant_id: Number.parseInt(v.providerVariantId, 10),
      retail_price: (Number(v.priceMinor) / 100).toFixed(2),
      files: input.images.map((image) => ({ url: image.url })),
    })),
  };
}
