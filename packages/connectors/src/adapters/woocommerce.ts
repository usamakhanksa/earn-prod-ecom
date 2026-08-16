import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type { Ctx, HealthResult, NormalisedOrder, Page, PublishInput, PublishResult, UpdateInput } from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * WooCommerce adapter (api-registration.md §2.2 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-16 via WebFetch against
 * https://woocommerce.github.io/woocommerce-rest-api-docs/:
 *  - Auth: HTTP **Basic Auth** using the Consumer Key as username and the
 *    Consumer Secret as password — WooCommerce's own docs recommend this
 *    "over HTTPS" and reserve **OAuth 1.0a "one-legged" HMAC signing for
 *    plain HTTP only** (to avoid sending credentials in cleartext when TLS
 *    isn't available). This task's own instruction is to VALIDATE HTTPS —
 *    since this adapter refuses any non-HTTPS `storeUrl` outright (see
 *    `resolveBaseUrl` below), the OAuth1.0a HMAC path is never reachable and
 *    was deliberately not implemented, rather than building a second, unused
 *    signing scheme.
 *  - Base URL pattern (confirmed): `{storeUrl}/wp-json/wc/v3/`.
 *  - Confirmed endpoints: `GET/POST /products`, `PUT/DELETE /products/{id}`,
 *    `GET /orders`.
 *  - WooCommerce is self-hosted per-tenant (api-registration.md: "base URL
 *    varies per tenant") — this SDK's `Ctx` has no dedicated store-URL field,
 *    so `Ctx.externalAccountId` is reused to carry the tenant's own site base
 *    URL, the same "reuse an existing field, document it" pattern Printify
 *    uses for `shopId` and Prodigi uses for a SKU seed list.
 *    `Ctx.accessToken`/`Ctx.secondaryToken` carry the Consumer Key/Secret
 *    pair (`CREDENTIAL_KINDS.HMAC_PAIR` in `packages/shared`), mirroring how
 *    Prodigi reuses `Ctx.secondaryToken` for its sandbox/live key pair.
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md):
 *  - WooCommerce's native Webhooks resource (`/wp-json/wc/v3/webhooks`,
 *    delivered payloads carrying an `X-WC-Webhook-Topic` header) is a
 *    long-stable, well-documented core REST feature — confirmed to exist by
 *    name via this pass's docs fetch context, but its registration call was
 *    not independently re-verified with a fresh fetch this specific pass.
 *  - `DELETE /products/{id}?force=true` (permanent delete, vs. the default
 *    soft-trash behaviour) follows WooCommerce's long-documented v3
 *    convention; not re-confirmed via a live authenticated call this pass.
 *  - There is no fulfilment or earnings concept in WooCommerce **core** REST
 *    (fulfilment/tracking is an extension-level feature in real installs,
 *    not part of the base API) — `canFulfil`/`canFetchEarnings` are `false`
 *    and no corresponding methods exist, rather than guessing a
 *    plugin-specific endpoint that may not be installed on a given tenant's
 *    site.
 *  - There is no platform-wide published rate limit to confirm — WooCommerce
 *    is self-hosted, so throughput depends entirely on the tenant's own
 *    hosting. The `rateLimit` recorded on this connector's registry row is
 *    OmniSell's own self-imposed courtesy default, not a WooCommerce number.
 */

const DOCS_URL = 'https://woocommerce.github.io/woocommerce-rest-api-docs/';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: false, // no fulfilment/tracking concept in WooCommerce core REST — see doc comment
  canFetchCost: false, // storefront platform, not a print-cost catalog provider
  canFetchEarnings: false, // no earnings surface in core REST
  supportsWebhooks: true,
  supportsSandbox: false,
  ordersMechanism: 'webhook',
};

/** Validates and normalises the tenant's self-hosted WooCommerce base URL.
 * HTTPS is mandatory (task requirement) — Basic Auth over plain HTTP would
 * send the consumer key/secret in cleartext, which this adapter refuses to
 * do rather than silently downgrading to the OAuth1.0a HMAC path. */
function resolveBaseUrl(ctx: Ctx): string {
  if (ctx.externalAccountId === undefined) {
    throw new Error('WooCommerce calls require the tenant\'s store URL (Ctx.externalAccountId)');
  }
  let parsed: URL;
  try {
    parsed = new URL(ctx.externalAccountId);
  } catch {
    throw new Error(`WooCommerce store URL is not a valid URL: "${ctx.externalAccountId}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`WooCommerce store URL must use HTTPS — got "${parsed.protocol}//${parsed.host}"`);
  }
  return `${parsed.origin}/wp-json/wc/v3`;
}

function authHeaders(ctx: Ctx): Record<string, string> {
  const key = ctx.accessToken ?? '';
  const secret = ctx.secondaryToken ?? '';
  return {
    authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
    'content-type': 'application/json',
  };
}

export const woocommerceAdapter: ConnectorAdapter = {
  slug: 'woocommerce',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const products = await fetchJson<Array<{ id: number; name: string }>>(`${resolveBaseUrl(ctx)}/products?per_page=1`, {
      headers: authHeaders(ctx),
    });
    return {
      ok: true,
      accountLabel: new URL(ctx.externalAccountId ?? '').host,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: products.length > 0 ? `Connected — sample product "${products[0]?.name}"` : 'Connected — store has no products yet',
    };
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toWooProductPayload(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const product = await fetchJson<{ id: number }>(`${resolveBaseUrl(ctx)}/products`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify(toWooProductPayload(input)),
    });
    return { externalId: String(product.id), statusUrl: `${resolveBaseUrl(ctx)}/products/${product.id}` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const product = await fetchJson<{ id: number }>(`${resolveBaseUrl(ctx)}/products/${input.externalId}`, {
      method: 'PUT',
      headers: authHeaders(ctx),
      body: JSON.stringify(toWooProductPayload(input)),
    });
    return { externalId: String(product.id), statusUrl: `${resolveBaseUrl(ctx)}/products/${product.id}` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await fetchJson<unknown>(`${resolveBaseUrl(ctx)}/products/${externalId}?force=true`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
    });
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const page = cursor !== undefined ? Number.parseInt(cursor, 10) : 1;
    const perPage = 25;
    const orders = await fetchJson<
      Array<{
        id: number;
        status: string;
        billing?: { first_name?: string; last_name?: string; email?: string };
        currency: string;
        total: string;
        line_items: Array<{ product_id: number; quantity: number; total: string }>;
        date_created: string;
      }>
    >(`${resolveBaseUrl(ctx)}/orders?page=${page}&per_page=${perPage}`, { headers: authHeaders(ctx) });
    const items = orders.map((order) => ({
      externalOrderId: String(order.id),
      status: order.status,
      buyerName: order.billing !== undefined ? `${order.billing.first_name ?? ''} ${order.billing.last_name ?? ''}`.trim() || null : null,
      buyerEmail: order.billing?.email ?? null,
      currency: order.currency,
      totalMinor: BigInt(Math.round(Number.parseFloat(order.total) * 100)),
      items: order.line_items.map((item) => ({
        externalVariantId: String(item.product_id),
        quantity: item.quantity,
        priceMinor: BigInt(Math.round(Number.parseFloat(item.total) * 100)),
        currency: order.currency,
      })),
      createdAt: order.date_created,
    }));
    return { items, nextCursor: items.length === perPage ? String(page + 1) : null };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'WooCommerce', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('WooCommerce', error);
  },
};

function toWooProductPayload(input: PublishInput): unknown {
  return {
    name: input.title,
    description: input.description,
    tags: input.tags.map((tag) => ({ name: tag })),
    regular_price: input.variants[0] !== undefined ? (Number(input.variants[0].priceMinor) / 100).toFixed(2) : '0.00',
    images: input.images.map((image) => ({ src: image.url, alt: image.placement })),
  };
}
