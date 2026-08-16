import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type { CostQuote, Ctx, Fulfilment, FulfilInput, HealthResult, NormalisedEvent, NormalisedOrder, Page, RawWebhook } from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Prodigi adapter (api-registration.md §2.1 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-11 via WebFetch (https://www.prodigi.com/print-api/docs/)
 * + WebSearch:
 *  - Auth: `X-API-Key` header (confirmed — Prodigi's own quick-start curl
 *    example uses exactly this header).
 *  - Base URLs (confirmed): Sandbox `https://api.sandbox.prodigi.com/v4.0`,
 *    Live `https://api.prodigi.com/v4.0`. Separate sandbox/live API keys per
 *    api-registration.md — `Ctx.accessToken` holds whichever key matches
 *    `Ctx.sandbox`.
 *  - `POST /v4.0/Orders` (confirmed, direct curl example in Prodigi's own
 *    docs) is both "submit an order" and, for Prodigi, the closest analogue
 *    to `submitFulfilment` — Prodigi has no separate storefront listing to
 *    publish to (see capabilities note below).
 *  - A `Quotes` endpoint exists (confirmed via search: "Prodigi Quotes API")
 *    used here for `fetchCosts`.
 *
 * DELIBERATE CAPABILITY GAP — NOT an oversight: Prodigi is a pure fulfilment
 * API (an order-and-product-lookup surface a merchant's own store calls into)
 * with no public "create/update/delete a storefront listing" endpoint in its
 * documented API. `capabilities.canPublish/canUpdate/canUnpublish` are
 * therefore `false` and this adapter intentionally has no `publish`/`update`/
 * `unpublish` methods — attaching fabricated ones would violate prompt.md
 * constraint #2 ("never invent an endpoint"). `canAutomate` stays `true`
 * because order submission and cost/catalog lookups ARE real, live-documented
 * automation.
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md — genuinely open):
 *  - Prodigi's public docs (as fetched) show single-SKU product lookup
 *    (`GET /Products/{sku}`) but no confirmed bulk "list the whole catalog"
 *    endpoint. `fetchBlueprints` therefore syncs a caller-supplied SKU list
 *    (`Ctx.externalAccountId`, reused here as a comma-separated SKU seed list
 *    — documented in docs/CONNECTORS.md) rather than inventing a catalog-list
 *    call that was never confirmed to exist.
 *  - The exact webhook/callback payload shape for order-status changes was
 *    not independently confirmed live; `handleWebhook` parses the documented
 *    general shape (`{ order: { id, status } }`) and is flagged for
 *    re-verification once real sandbox credentials are available.
 */

const LIVE_BASE_URL = 'https://api.prodigi.com/v4.0';
const SANDBOX_BASE_URL = 'https://api.sandbox.prodigi.com/v4.0';
const DOCS_URL = 'https://www.prodigi.com/print-api/docs/reference/';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: false,
  canUpdate: false,
  canUnpublish: false,
  canSyncOrders: true,
  canFulfil: true,
  canFetchCost: true,
  canFetchEarnings: false,
  supportsWebhooks: true,
  supportsSandbox: true, // confirmed: Prodigi's sandbox is documented as "genuinely usable"
  ordersMechanism: 'webhook',
};

function baseUrl(ctx: Ctx): string {
  return ctx.sandbox ? SANDBOX_BASE_URL : LIVE_BASE_URL;
}

function authHeaders(ctx: Ctx): Record<string, string> {
  return { 'X-API-Key': ctx.accessToken ?? '', 'content-type': 'application/json' };
}

export const prodigiAdapter: ConnectorAdapter = {
  slug: 'prodigi',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    // No dedicated "whoami"/account endpoint confirmed live — a bounded
    // Orders list call is the honest connectivity check (flagged above).
    await fetchJson<{ orders: unknown[] }>(`${baseUrl(ctx)}/Orders?top=1`, { headers: authHeaders(ctx) });
    return {
      ok: true,
      accountLabel: ctx.sandbox ? 'Prodigi (sandbox)' : 'Prodigi (live)',
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: 'Connected to the Prodigi Print API',
    };
  },

  async fetchBlueprints(ctx) {
    const skus = (ctx.externalAccountId ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const blueprints = [];
    for (const sku of skus) {
       
      const product = await fetchJson<{ sku: string; description: string; productDimensions?: { width: number; height: number; units: string } }>(
        `${baseUrl(ctx)}/Products/${sku}`,
        { headers: authHeaders(ctx) },
      );
      blueprints.push({
        providerBlueprintId: product.sku,
        name: product.description,
        category: 'PRINT',
        printAreas: [],
        sizes: [product.productDimensions !== undefined ? `${product.productDimensions.width}x${product.productDimensions.height}${product.productDimensions.units}` : 'default'],
        colors: [],
        variants: [
          {
            providerVariantId: product.sku,
            size: 'default',
            color: 'default',
            baseCostMinor: 0n,
            currency: 'USD',
            inStock: true,
          },
        ],
      });
    }
    return blueprints;
  },

  async fetchCosts(ctx: Ctx, ids: string[]): Promise<CostQuote[]> {
    const quote = await fetchJson<{ quotes: Array<{ costSummary: { items: { amount: string; currency: string } }; items: Array<{ sku: string }> }> }>(
      `${baseUrl(ctx)}/quotes`,
      {
        method: 'POST',
        headers: authHeaders(ctx),
        body: JSON.stringify({ shippingMethod: 'Standard', items: ids.map((sku) => ({ sku, copies: 1 })) }),
      },
    );
    return quote.quotes.flatMap((q) =>
      q.items.map((item) => ({
        providerVariantId: item.sku,
        costMinor: BigInt(Math.round(Number.parseFloat(q.costSummary.items.amount) * 100)),
        currency: q.costSummary.items.currency,
      })),
    );
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const top = 20;
    const skip = cursor !== undefined ? Number.parseInt(cursor, 10) : 0;
    const body = await fetchJson<{
      orders: Array<{ id: string; status: { stage: string }; recipient?: { name?: string; email?: string }; charges?: Array<{ totalCost?: { amount: string; currency: string } }>; items: Array<{ sku: string; copies: number; costSummary?: { totalCost?: { amount: string; currency: string } } }>; created: string }>;
    }>(`${baseUrl(ctx)}/Orders?top=${top}&skip=${skip}`, { headers: authHeaders(ctx) });
    const items = body.orders.map((order) => {
      const currency = order.charges?.[0]?.totalCost?.currency ?? 'USD';
      const totalMinor = order.charges?.reduce((sum, c) => sum + Math.round(Number.parseFloat(c.totalCost?.amount ?? '0') * 100), 0) ?? 0;
      return {
        externalOrderId: order.id,
        status: order.status.stage,
        buyerName: order.recipient?.name ?? null,
        buyerEmail: order.recipient?.email ?? null,
        currency,
        totalMinor: BigInt(totalMinor),
        items: order.items.map((item) => ({
          externalVariantId: item.sku,
          quantity: item.copies,
          priceMinor: BigInt(Math.round(Number.parseFloat(item.costSummary?.totalCost?.amount ?? '0') * 100)),
          currency,
        })),
        createdAt: order.created,
      };
    });
    return { items, nextCursor: items.length === top ? String(skip + top) : null };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    // Flagged uncertainty above: general documented shape, not live-confirmed.
    const body = req.body as { order?: { id?: string; status?: { stage?: string } } };
    return [
      {
        type: body.order?.status?.stage ?? 'unknown',
        externalOrderId: body.order?.id ?? null,
        occurredAt: new Date().toISOString(),
        raw: body,
      },
    ];
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    const body = await fetchJson<{ order: { id: string; status: { stage: string }; shipments?: Array<{ tracking?: { number?: string; url?: string }; carrier?: { name?: string } }> } }>(
      `${baseUrl(ctx)}/Orders`,
      { method: 'POST', headers: authHeaders(ctx), body: JSON.stringify({ merchantReference: input.externalOrderId, shippingAddress: input.shippingAddress }) },
    );
    const shipment = body.order.shipments?.[0];
    return {
      externalFulfilmentId: body.order.id,
      status: body.order.status.stage,
      trackingNumber: shipment?.tracking?.number ?? null,
      trackingUrl: shipment?.tracking?.url ?? null,
      carrier: shipment?.carrier?.name ?? null,
    };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Prodigi', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Prodigi', error);
  },
};
