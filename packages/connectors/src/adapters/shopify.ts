import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type {
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
  UpdateInput,
} from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Shopify adapter (api-registration.md §2.2 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-16 via WebFetch against https://shopify.dev/docs/api/admin-graphql:
 *  - Base URL pattern (confirmed): `https://{shop}.myshopify.com/admin/api/{version}/graphql.json`.
 *  - API version referenced live by Shopify's own docs page this pass: `2026-07`
 *    (Shopify ships a new dated version every quarter — this WILL need bumping
 *    periodically; not a one-time constant).
 *  - Auth header (confirmed): `X-Shopify-Access-Token`.
 *  - Two auth mechanisms exist, both confirmed: **OAuth 2.0 for public apps**
 *    (Shopify Partners → Dev Dashboard, App Store review + mandatory GDPR
 *    webhooks) **or an Admin API access token for a merchant's own custom
 *    app** (created directly in the merchant's admin, no review).
 *
 * **THIS ADAPTER USES THE CUSTOM-APP ACCESS TOKEN PATH, not OAuth** — a
 * deliberate choice per this task's own instruction to pick one and document
 * why: api-registration.md's own guidance for Shopify says exactly this
 * ("Custom app token is faster for early users"), and the OAuth public-app
 * path additionally requires Shopify App Store review plus implementing
 * Shopify's mandatory GDPR webhook trio (customers/redact, shop/redact,
 * customers/data_request) before an app can even be submitted — real,
 * material overhead this pass explicitly did not build. `Ctx.accessToken`
 * therefore holds the merchant's own Admin API access token (`shpat_...`),
 * pasted directly into the connection wizard like Printify's PAT — no
 * `buildAuthUrl`/`exchangeCode`/`refresh` on this adapter. `Ctx.externalAccountId`
 * holds the shop's `*.myshopify.com` domain (same reuse pattern Printify uses
 * for `shopId` and Gelato uses for `storeId`).
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md):
 *  - The exact GraphQL mutation field selections below (`productCreate`,
 *    `productUpdate`, `productDelete`, `orders`, `fulfillmentCreate`) use
 *    Shopify's long-stable, well-documented Admin GraphQL mutation/query
 *    NAMES — confirmed to exist by name via the live docs page fetched this
 *    pass and Shopify's own published schema history — but the literal field
 *    selection sets below were not re-confirmed against a live authenticated
 *    call this pass (no shop/token available in this sandbox).
 *  - Shopify's real rate limiting is a **cost-based bucket** (each GraphQL
 *    field costs points, not a flat requests/second count) — the numeric
 *    `rateLimit` recorded on this connector's registry row is a rough
 *    requests-per-minute APPROXIMATION of that point budget, not a literal
 *    published "N requests/second" figure the way Etsy's is.
 *  - Fulfilment/order endpoints assume the merchant fulfils through
 *    OmniSell rather than Shopify's own managed fulfilment services;
 *    Shopify Flow/Fulfillment Services interplay was not investigated.
 */

const ADMIN_API_VERSION = '2026-07';
const DOCS_URL = 'https://shopify.dev/docs/api/admin-graphql';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: true,
  canFetchCost: false, // Shopify is the merchant's own storefront, not a print-cost catalog provider
  canFetchEarnings: false, // no distinct "earnings" surface beyond the merchant's own orders
  supportsWebhooks: true,
  supportsSandbox: false, // no formal sandbox flag confirmed (dev stores exist but aren't a documented API "sandbox" mode)
  ordersMechanism: 'webhook',
};

function shopDomain(ctx: Ctx): string {
  if (ctx.externalAccountId === undefined) {
    throw new Error('Shopify calls require the shop domain (Ctx.externalAccountId, e.g. "mystore.myshopify.com")');
  }
  return ctx.externalAccountId;
}

function graphqlUrl(ctx: Ctx): string {
  return `https://${shopDomain(ctx)}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
}

function authHeaders(ctx: Ctx): Record<string, string> {
  return { 'X-Shopify-Access-Token': ctx.accessToken ?? '', 'content-type': 'application/json' };
}

interface GraphQlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function graphql<T>(ctx: Ctx, query: string, variables?: Record<string, unknown>): Promise<T> {
  const envelope = await fetchJson<GraphQlEnvelope<T>>(graphqlUrl(ctx), {
    method: 'POST',
    headers: authHeaders(ctx),
    body: JSON.stringify({ query, variables }),
  });
  if (envelope.errors !== undefined && envelope.errors.length > 0) {
    throw new Error(envelope.errors.map((e) => e.message).join('; '));
  }
  if (envelope.data === undefined) {
    throw new SyntaxError('Shopify GraphQL response had no data field');
  }
  return envelope.data;
}

export const shopifyAdapter: ConnectorAdapter = {
  slug: 'shopify',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const data = await graphql<{ shop: { name: string; myshopifyDomain: string } }>(ctx, `query { shop { name myshopifyDomain } }`);
    return {
      ok: true,
      accountLabel: data.shop.name,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: `Connected to Shopify store "${data.shop.name}"`,
    };
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toProductInput(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const data = await graphql<{ productCreate: { product: { id: string } | null; userErrors: Array<{ message: string }> } }>(
      ctx,
      `mutation productCreate($input: ProductInput!) { productCreate(input: $input) { product { id } userErrors { message } } }`,
      { input: toProductInput(input) },
    );
    if (data.productCreate.product === null) {
      throw new Error(data.productCreate.userErrors.map((e) => e.message).join('; ') || 'Shopify rejected productCreate');
    }
    return { externalId: data.productCreate.product.id, statusUrl: `https://${shopDomain(ctx)}/admin/products` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const data = await graphql<{ productUpdate: { product: { id: string } | null; userErrors: Array<{ message: string }> } }>(
      ctx,
      `mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { message } } }`,
      { input: { id: input.externalId, ...toProductInput(input) } },
    );
    if (data.productUpdate.product === null) {
      throw new Error(data.productUpdate.userErrors.map((e) => e.message).join('; ') || 'Shopify rejected productUpdate');
    }
    return { externalId: data.productUpdate.product.id, statusUrl: `https://${shopDomain(ctx)}/admin/products` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await graphql<{ productDelete: { deletedProductId: string | null; userErrors: Array<{ message: string }> } }>(
      ctx,
      `mutation productDelete($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { message } } }`,
      { input: { id: externalId } },
    );
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const data = await graphql<{
      orders: {
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            displayFinancialStatus: string;
            customer: { displayName?: string; email?: string } | null;
            currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
            lineItems: { edges: Array<{ node: { variant: { id: string } | null; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } } }> };
            createdAt: string;
          };
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    }>(
      ctx,
      `query orders($after: String) { orders(first: 25, after: $after) { edges { cursor node { id displayFinancialStatus customer { displayName email } currentTotalPriceSet { shopMoney { amount currencyCode } } lineItems(first: 50) { edges { node { variant { id } quantity originalUnitPriceSet { shopMoney { amount } } } } } createdAt } } pageInfo { hasNextPage } } }`,
      { after: cursor ?? null },
    );
    const items = data.orders.edges.map(({ node: order }) => ({
      externalOrderId: order.id,
      status: order.displayFinancialStatus,
      buyerName: order.customer?.displayName ?? null,
      buyerEmail: order.customer?.email ?? null,
      currency: order.currentTotalPriceSet.shopMoney.currencyCode,
      totalMinor: BigInt(Math.round(Number.parseFloat(order.currentTotalPriceSet.shopMoney.amount) * 100)),
      items: order.lineItems.edges.map(({ node: item }) => ({
        externalVariantId: item.variant?.id ?? '',
        quantity: item.quantity,
        priceMinor: BigInt(Math.round(Number.parseFloat(item.originalUnitPriceSet.shopMoney.amount) * 100)),
        currency: order.currentTotalPriceSet.shopMoney.currencyCode,
      })),
      createdAt: order.createdAt,
    }));
    const lastEdge = data.orders.edges[data.orders.edges.length - 1];
    return { items, nextCursor: data.orders.pageInfo.hasNextPage && lastEdge !== undefined ? lastEdge.cursor : null };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    const body = req.body as { id?: number | string; financial_status?: string; created_at?: string };
    const topic = req.headers['x-shopify-topic'] ?? req.headers['X-Shopify-Topic'] ?? 'unknown';
    return [
      {
        type: topic,
        externalOrderId: body.id !== undefined ? String(body.id) : null,
        occurredAt: body.created_at ?? new Date().toISOString(),
        raw: body,
      },
    ];
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    const data = await graphql<{
      fulfillmentCreate: { fulfillment: { id: string; status: string; trackingInfo: Array<{ number?: string; url?: string; company?: string }> } | null; userErrors: Array<{ message: string }> };
    }>(
      ctx,
      `mutation fulfillmentCreate($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status trackingInfo { number url company } } userErrors { message } } }`,
      { fulfillment: { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: input.externalOrderId }] } },
    );
    if (data.fulfillmentCreate.fulfillment === null) {
      throw new Error(data.fulfillmentCreate.userErrors.map((e) => e.message).join('; ') || 'Shopify rejected fulfillmentCreate');
    }
    const fulfilment = data.fulfillmentCreate.fulfillment;
    const tracking = fulfilment.trackingInfo[0];
    return {
      externalFulfilmentId: fulfilment.id,
      status: fulfilment.status,
      trackingNumber: tracking?.number ?? null,
      trackingUrl: tracking?.url ?? null,
      carrier: tracking?.company ?? null,
    };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Shopify', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Shopify', error);
  },
};

function toProductInput(input: PublishInput): Record<string, unknown> {
  return {
    title: input.title,
    descriptionHtml: input.description,
    tags: input.tags,
    variants: input.variants.map((v) => ({ price: (Number(v.priceMinor) / 100).toFixed(2) })),
    images: input.images.map((image) => ({ src: image.url, altText: image.placement })),
  };
}
