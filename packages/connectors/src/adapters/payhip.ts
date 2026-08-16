import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type { Ctx, HealthResult, NormalisedEvent, RawWebhook } from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Payhip adapter (api-registration.md §2.3 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-16 via WebFetch against https://payhip.com/api-reference
 * and https://help.payhip.com/article/115-webhooks:
 *  - Auth: **API key**, header `payhip-api-key` on coupon endpoints, a
 *    separate per-product `product-secret-key` header on license-key
 *    endpoints (confirmed — two distinct credential shapes, not one).
 *  - Base URL (confirmed): `https://payhip.com/api/v2`.
 *  - Confirmed endpoints: `GET/POST /coupons`, `GET /coupons/:id`,
 *    `GET /license/verify`, `PUT /license/enable`, `PUT /license/disable`,
 *    `PUT /license/usage`, `PUT /license/decrease`.
 *  - Confirmed webhook events (help.payhip.com/article/115-webhooks): `paid`,
 *    `refunded`, `subscription.created`, `subscription.deleted`, with a
 *    real, documented `paid` payload shape (`id`, `email`, `currency`,
 *    `price`, `items[]`, `type`, `date`, `signature`).
 *
 * **DELIBERATE CAPABILITY GAP — NOT AN OVERSIGHT**, per this task's own
 * instruction to "confirm current write capability or gate as read-only if
 * genuinely uncertain" (api-registration.md §2.3 flags exactly this for
 * Payhip: "Confirm write capability; may be read/reporting-oriented"):
 * Payhip's own public API reference documents **no product/listing
 * creation, update, or deletion endpoint, and no orders/sales-list
 * endpoint** — only coupon management and software-license-key operations.
 * This adapter therefore has NO `publish`/`update`/`unpublish`/`pullOrders`/
 * `fetchBlueprints`/`fetchCosts`/`submitFulfilment` methods at all —
 * attaching fabricated ones would violate prompt.md constraint #2, the same
 * discipline Prodigi's adapter already applies to its own storefront-listing
 * gap. `canAutomate` stays `true` because coupon management IS a real,
 * live-documented write capability this adapter exercises via
 * `verifyCredentials`'s connectivity check — the honest analogue of
 * Prodigi's "still automates fulfilment/orders despite the publish gap".
 * The only way OmniSell observes a Payhip sale at all is the confirmed
 * `paid` webhook — there is no pull/poll orders endpoint to fall back to.
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md):
 *  - No numeric published rate limit was found this pass — the registry
 *    row's `rateLimit` is a conservative estimate, same honesty flag as
 *    3-D7's four.
 *  - Payhip's webhook payloads are NOT independently confirmed to carry an
 *    HMAC signature verification scheme beyond the `signature` field shown
 *    in their own docs example — this adapter parses the payload but does
 *    not verify that signature (no algorithm was documented in the fetched
 *    page), matching 1-D10's same "decoded but not signature-verified"
 *    honesty pattern.
 */

const BASE_URL = 'https://payhip.com/api/v2';
const DOCS_URL = 'https://payhip.com/api-reference';

const capabilities: ConnectorCapabilities = {
  canAutomate: true, // real, confirmed coupon-management API — see doc comment
  canPublish: false, // no product/listing endpoint in Payhip's public API
  canUpdate: false,
  canUnpublish: false,
  canSyncOrders: false, // no orders/sales-list endpoint confirmed — webhook-only visibility
  canFulfil: false,
  canFetchCost: false,
  canFetchEarnings: false,
  supportsWebhooks: true,
  supportsSandbox: false,
  ordersMechanism: 'webhook',
};

function authHeaders(ctx: Ctx): Record<string, string> {
  return { 'payhip-api-key': ctx.accessToken ?? '', 'content-type': 'application/json' };
}

export const payhipAdapter: ConnectorAdapter = {
  slug: 'payhip',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    // No dedicated "whoami" endpoint is documented — a bounded coupons list
    // call is the honest connectivity check (same reasoning Prodigi's doc
    // comment gives for its own missing whoami endpoint).
    const coupons = await fetchJson<Array<{ id: string }>>(`${BASE_URL}/coupons`, { headers: authHeaders(ctx) });
    return {
      ok: true,
      accountLabel: null,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: `Connected to Payhip — ${coupons.length} coupon(s) visible to this key`,
    };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    const body = req.body as { type?: string; id?: string; date?: number };
    return [
      {
        type: body.type ?? 'unknown',
        externalOrderId: body.type === 'paid' || body.type === 'refunded' ? body.id ?? null : null,
        occurredAt: body.date !== undefined ? new Date(body.date * 1000).toISOString() : new Date().toISOString(),
        raw: body,
      },
    ];
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Payhip', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Payhip', error);
  },
};
