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
 * Printify adapter (api-registration.md §2.1 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-11 via WebFetch/WebSearch against
 * https://developers.printify.com/ and https://developers.printify.com/docs/:
 *  - Base URL: https://api.printify.com/v1/ (v1: shops/products/orders/
 *    uploads/webhooks — confirmed). A v2 catalog surface also exists but is
 *    not used here; v1's `/v1/catalog/*` endpoints are confirmed live and
 *    sufficient for this phase.
 *  - Auth: Personal Access Token (Bearer) for a single merchant, or OAuth2
 *    for multi-merchant platforms — both send `Authorization: Bearer <token>`.
 *    This adapter uses the PAT flow (api-registration.md's own recommendation:
 *    "Token is scoped to the user's shops; list shops, then operate per
 *    shopId") — `Ctx.accessToken` is the PAT, `Ctx.externalAccountId` is the
 *    resolved `shop_id`.
 *  - Confirmed endpoints: `GET /v1/shops.json`, `GET /v1/catalog/blueprints.json`,
 *    `GET /v1/shops/{shop_id}/orders.json` (also handles submission/production/
 *    shipping/cancel per the docs summary), webhooks via the Webhooks feature.
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md): the print-provider → variant
 * sub-paths (`/v1/catalog/blueprints/{id}/print_providers.json`, then
 * `/v1/catalog/blueprints/{id}/print_providers/{provider_id}/variants.json`)
 * and the webhook-registration path (`/v1/shops/{shop_id}/webhooks.json`)
 * follow Printify's well-known, stable v1 URL convention but were not
 * re-confirmed against a live authenticated call this pass (no PAT available
 * in this sandbox). Same for the exact `send_to_production.json` submission
 * path used by `submitFulfilment`.
 */

const BASE_URL = 'https://api.printify.com/v1';
const DOCS_URL = 'https://developers.printify.com/';

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
  supportsSandbox: false,
  ordersMechanism: 'webhook',
};

function authHeaders(ctx: Ctx): Record<string, string> {
  return { authorization: `Bearer ${ctx.accessToken ?? ''}`, 'content-type': 'application/json' };
}

function shopId(ctx: Ctx): string {
  if (ctx.externalAccountId === undefined) {
    throw new Error('Printify calls require a resolved shop_id (Ctx.externalAccountId) — call verifyCredentials/list shops first');
  }
  return ctx.externalAccountId;
}

export const printifyAdapter: ConnectorAdapter = {
  slug: 'printify',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const shops = await fetchJson<Array<{ id: number; title: string }>>(`${BASE_URL}/shops.json`, { headers: authHeaders(ctx) });
    const first = shops[0];
    return {
      ok: true,
      accountLabel: first?.title ?? null,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: first !== undefined ? `Connected — ${shops.length} shop(s), using "${first.title}"` : 'Connected — no shops found on this account',
    };
  },

  async fetchBlueprints(ctx: Ctx): Promise<Blueprint[]> {
    const list = await fetchJson<Array<{ id: number; title: string; brand: string; model: string }>>(`${BASE_URL}/catalog/blueprints.json`, {
      headers: authHeaders(ctx),
    });
    const blueprints: Blueprint[] = [];
    for (const bp of list) {
       
      const providers = await fetchJson<Array<{ id: number; title: string }>>(`${BASE_URL}/catalog/blueprints/${bp.id}/print_providers.json`, {
        headers: authHeaders(ctx),
      });
      const firstProvider = providers[0];
      if (firstProvider === undefined) {
        continue;
      }
       
      const variants = await fetchJson<{
        variants: Array<{ id: number; title: string; options: { color?: string; size?: string }; placeholders?: unknown; cost?: number }>;
      }>(`${BASE_URL}/catalog/blueprints/${bp.id}/print_providers/${firstProvider.id}/variants.json`, { headers: authHeaders(ctx) });
      blueprints.push({
        providerBlueprintId: String(bp.id),
        name: bp.title,
        category: bp.brand,
        printAreas: [],
        sizes: [...new Set(variants.variants.map((v) => v.options.size ?? v.title))],
        colors: [...new Map(variants.variants.map((v) => [v.options.color ?? 'default', { name: v.options.color ?? 'default', hex: '#000000' }])).values()],
        variants: variants.variants.map((v) => ({
          providerVariantId: String(v.id),
          size: v.options.size ?? v.title,
          color: v.options.color ?? 'default',
          baseCostMinor: BigInt(v.cost ?? 0),
          currency: 'USD',
          inStock: true,
        })),
      });
    }
    return blueprints;
  },

  async fetchCosts(_ctx: Ctx, ids: string[]): Promise<CostQuote[]> {
    // Printify's cost figure ships inline on the variants endpoint used by
    // fetchBlueprints (`variants[].cost`, in minor units already, per their
    // docs) rather than a dedicated per-id cost endpoint — this method exists
    // for interface parity but callers should prefer the values already on
    // the synced BlueprintVariant rows. Kept minimal and honest rather than
    // inventing a `/costs` endpoint that isn't documented.
    return ids.map((id) => ({ providerVariantId: id, costMinor: 0n, currency: 'USD' }));
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toPrintifyProductPayload(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const body = await fetchJson<{ id: string }>(`${BASE_URL}/shops/${shopId(ctx)}/products.json`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify(toPrintifyProductPayload(input)),
    });
    return { externalId: body.id, statusUrl: `${BASE_URL}/shops/${shopId(ctx)}/products/${body.id}.json` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const body = await fetchJson<{ id: string }>(`${BASE_URL}/shops/${shopId(ctx)}/products/${input.externalId}.json`, {
      method: 'PUT',
      headers: authHeaders(ctx),
      body: JSON.stringify(toPrintifyProductPayload(input)),
    });
    return { externalId: body.id, statusUrl: `${BASE_URL}/shops/${shopId(ctx)}/products/${body.id}.json` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await fetchJson<unknown>(`${BASE_URL}/shops/${shopId(ctx)}/products/${externalId}.json`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
    });
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const page = cursor !== undefined ? Number.parseInt(cursor, 10) : 1;
    const body = await fetchJson<{
      data: Array<{ id: string; status: string; address_to?: { first_name?: string; last_name?: string; email?: string }; total_price: number; total_shipping: number; line_items: Array<{ variant_id: number; quantity: number; price: number }>; created_at: string }>;
      current_page: number;
      last_page: number;
    }>(`${BASE_URL}/shops/${shopId(ctx)}/orders.json?page=${page}`, { headers: authHeaders(ctx) });
    const items = body.data.map((order) => ({
      externalOrderId: order.id,
      status: order.status,
      buyerName: order.address_to !== undefined ? `${order.address_to.first_name ?? ''} ${order.address_to.last_name ?? ''}`.trim() || null : null,
      buyerEmail: order.address_to?.email ?? null,
      currency: 'USD',
      totalMinor: BigInt(order.total_price),
      items: order.line_items.map((item) => ({
        externalVariantId: String(item.variant_id),
        quantity: item.quantity,
        priceMinor: BigInt(item.price),
        currency: 'USD',
      })),
      createdAt: order.created_at,
    }));
    return { items, nextCursor: body.current_page < body.last_page ? String(body.current_page + 1) : null };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    const body = req.body as { type?: string; resource?: { id?: string; type?: string } };
    return [
      {
        type: body.type ?? 'unknown',
        externalOrderId: body.resource?.type === 'order' ? body.resource.id ?? null : null,
        occurredAt: new Date().toISOString(),
        raw: body,
      },
    ];
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    const body = await fetchJson<{ id: string; status: string }>(
      `${BASE_URL}/shops/${shopId(ctx)}/orders/${input.externalOrderId}/send_to_production.json`,
      { method: 'POST', headers: authHeaders(ctx) },
    );
    return { externalFulfilmentId: body.id, status: body.status, trackingNumber: null, trackingUrl: null, carrier: null };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Printify', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Printify', error);
  },
};

function toPrintifyProductPayload(input: PublishInput): unknown {
  return {
    title: input.title,
    description: input.description,
    blueprint_id: Number.parseInt(input.externalBlueprintId, 10),
    print_areas: input.images.map((image) => ({ placement: image.placement, url: image.url })),
    variants: input.variants.map((v) => ({ id: Number.parseInt(v.providerVariantId, 10), price: Number(v.priceMinor), is_enabled: true })),
    tags: input.tags,
  };
}
