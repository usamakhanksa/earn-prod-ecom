import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type {
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
  UpdateInput,
} from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Gelato adapter (api-registration.md §2.1 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-11 via WebSearch (dashboard.gelato.com/docs/ itself
 * returned HTTP 403 to a direct fetch in this sandbox — likely bot/JS-gated —
 * but its indexed sub-pages and the API's real, documented subdomains were
 * confirmed via search results pointing at that same live docs host):
 *  - Auth: `X-API-KEY` header on every request (confirmed).
 *  - The Gelato API spans dedicated REST subdomains rather than one base URL
 *    (confirmed): `order.gelatoapis.com` (orders), `product.gelatoapis.com`
 *    (global product catalog, v3 — confirmed path `v3/catalogs`), and
 *    `ecommerce.gelatoapis.com` (a tenant's own store products, v1 — confirmed
 *    path `v1/stores/{storeId}/products`, and a confirmed
 *    `ecommerce/products/create-from-template` doc page).
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md — genuinely open, not guessed
 * silently):
 *  - The exact hostname/version for the *pricing* subdomain (Gelato's own
 *    architecture summary mentions "pricing and stock" as a distinct surface
 *    from the product catalog) was not confirmed live. `fetchCosts` therefore
 *    reads the `price` field already present on a product-search result
 *    instead of calling an unconfirmed dedicated pricing endpoint.
 *  - The orders API version (`v4`) and the exact webhook registration path
 *    are inferred from Gelato's general versioning pattern, not independently
 *    re-confirmed against a live authenticated call (no API key available in
 *    this sandbox).
 */

const ORDER_BASE_URL = 'https://order.gelatoapis.com/v4';
const PRODUCT_BASE_URL = 'https://product.gelatoapis.com/v3';
const ECOMMERCE_BASE_URL = 'https://ecommerce.gelatoapis.com/v1';
const DOCS_URL = 'https://dashboard.gelato.com/docs/';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: true,
  canFetchCost: true,
  canFetchEarnings: false,
  supportsWebhooks: true,
  supportsSandbox: false, // no dedicated sandbox environment confirmed live for Gelato
  ordersMechanism: 'webhook',
};

function authHeaders(ctx: Ctx): Record<string, string> {
  return { 'X-API-KEY': ctx.accessToken ?? '', 'content-type': 'application/json' };
}

function storeId(ctx: Ctx): string {
  if (ctx.externalAccountId === undefined) {
    throw new Error('Gelato calls require a resolved storeId (Ctx.externalAccountId) — call verifyCredentials first');
  }
  return ctx.externalAccountId;
}

export const gelatoAdapter: ConnectorAdapter = {
  slug: 'gelato',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const stores = await fetchJson<Array<{ id: string; name: string }>>(`${ECOMMERCE_BASE_URL}/stores`, { headers: authHeaders(ctx) });
    const first = stores[0];
    return {
      ok: true,
      accountLabel: first?.name ?? null,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: first !== undefined ? `Connected — store "${first.name}"` : 'Connected — no stores found on this account',
    };
  },

  async fetchBlueprints(ctx: Ctx): Promise<Blueprint[]> {
    const catalogs = await fetchJson<Array<{ catalogUid: string; title: string }>>(`${PRODUCT_BASE_URL}/catalogs`, { headers: authHeaders(ctx) });
    const blueprints: Blueprint[] = [];
    for (const catalog of catalogs) {
       
      const search = await fetchJson<{
        products: Array<{ productUid: string; variants: Array<{ variantUid: string; attributes: Record<string, string>; price?: number; currency?: string }> }>;
      }>(`${PRODUCT_BASE_URL}/products:search`, {
        method: 'POST',
        headers: authHeaders(ctx),
        body: JSON.stringify({ catalogUid: catalog.catalogUid, limit: 50 }),
      });
      const variants = search.products.flatMap((p) => p.variants);
      blueprints.push({
        providerBlueprintId: catalog.catalogUid,
        name: catalog.title,
        category: catalog.title,
        printAreas: [],
        sizes: [...new Set(variants.map((v) => v.attributes.size ?? 'default'))],
        colors: [...new Map(variants.map((v) => [v.attributes.color ?? 'default', { name: v.attributes.color ?? 'default', hex: '#000000' }])).values()],
        variants: variants.map((v) => ({
          providerVariantId: v.variantUid,
          size: v.attributes.size ?? 'default',
          color: v.attributes.color ?? 'default',
          baseCostMinor: BigInt(Math.round((v.price ?? 0) * 100)),
          currency: v.currency ?? 'USD',
          inStock: true,
        })),
      });
    }
    return blueprints;
  },

  async fetchCosts(ctx: Ctx, ids: string[]): Promise<CostQuote[]> {
    const search = await fetchJson<{ products: Array<{ variants: Array<{ variantUid: string; price?: number; currency?: string }> }> }>(
      `${PRODUCT_BASE_URL}/products:search`,
      { method: 'POST', headers: authHeaders(ctx), body: JSON.stringify({ variantUids: ids }) },
    );
    const byId = new Map(search.products.flatMap((p) => p.variants).map((v) => [v.variantUid, v]));
    return ids.map((id) => {
      const variant = byId.get(id);
      return { providerVariantId: id, costMinor: BigInt(Math.round((variant?.price ?? 0) * 100)), currency: variant?.currency ?? 'USD' };
    });
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toGelatoProductPayload(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const body = await fetchJson<{ id: string }>(`${ECOMMERCE_BASE_URL}/stores/${storeId(ctx)}/products:create-from-template`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify(toGelatoProductPayload(input)),
    });
    return { externalId: body.id, statusUrl: `${ECOMMERCE_BASE_URL}/stores/${storeId(ctx)}/products/${body.id}` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const body = await fetchJson<{ id: string }>(`${ECOMMERCE_BASE_URL}/stores/${storeId(ctx)}/products/${input.externalId}`, {
      method: 'PATCH',
      headers: authHeaders(ctx),
      body: JSON.stringify(toGelatoProductPayload(input)),
    });
    return { externalId: body.id, statusUrl: `${ECOMMERCE_BASE_URL}/stores/${storeId(ctx)}/products/${body.id}` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await fetchJson<unknown>(`${ECOMMERCE_BASE_URL}/stores/${storeId(ctx)}/products/${externalId}`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
    });
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const offset = cursor !== undefined ? Number.parseInt(cursor, 10) : 0;
    const body = await fetchJson<{
      orders: Array<{ id: string; fulfillmentStatus: string; recipient?: { email?: string; firstName?: string; lastName?: string }; currency: string; totalInclVat: number; items: Array<{ productUid: string; quantity: number; itemPriceInclVat: number }>; createdAt: string }>;
    }>(`${ORDER_BASE_URL}/orders?offset=${offset}&limit=20`, { headers: authHeaders(ctx) });
    const items = body.orders.map((order) => ({
      externalOrderId: order.id,
      status: order.fulfillmentStatus,
      buyerName: order.recipient !== undefined ? `${order.recipient.firstName ?? ''} ${order.recipient.lastName ?? ''}`.trim() || null : null,
      buyerEmail: order.recipient?.email ?? null,
      currency: order.currency,
      totalMinor: BigInt(Math.round(order.totalInclVat * 100)),
      items: order.items.map((item) => ({
        externalVariantId: item.productUid,
        quantity: item.quantity,
        priceMinor: BigInt(Math.round(item.itemPriceInclVat * 100)),
        currency: order.currency,
      })),
      createdAt: order.createdAt,
    }));
    return { items, nextCursor: items.length === 20 ? String(offset + 20) : null };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    const body = req.body as { event?: string; orderId?: string; timestamp?: string };
    return [
      {
        type: body.event ?? 'unknown',
        externalOrderId: body.orderId ?? null,
        occurredAt: body.timestamp ?? new Date().toISOString(),
        raw: body,
      },
    ];
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    const body = await fetchJson<{ id: string; fulfillmentStatus: string; shipments?: Array<{ trackingCode?: string; trackingUrl?: string; carrierName?: string }> }>(
      `${ORDER_BASE_URL}/orders`,
      { method: 'POST', headers: authHeaders(ctx), body: JSON.stringify({ orderReferenceId: input.externalOrderId }) },
    );
    const shipment = body.shipments?.[0];
    return {
      externalFulfilmentId: body.id,
      status: body.fulfillmentStatus,
      trackingNumber: shipment?.trackingCode ?? null,
      trackingUrl: shipment?.trackingUrl ?? null,
      carrier: shipment?.carrierName ?? null,
    };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Gelato', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Gelato', error);
  },
};

function toGelatoProductPayload(input: PublishInput): unknown {
  return {
    templateId: input.externalBlueprintId,
    title: input.title,
    description: input.description,
    tags: input.tags,
    images: input.images.map((image) => ({ placement: image.placement, url: image.url })),
    variants: input.variants.map((v) => ({ variantUid: v.providerVariantId, price: Number(v.priceMinor) / 100, currency: v.currency })),
  };
}
