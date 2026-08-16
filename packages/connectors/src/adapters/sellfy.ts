import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type { Ctx, HealthResult, NormalisedEvent, RawWebhook } from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Sellfy adapter (api-registration.md §2.3 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-16 via WebFetch/WebSearch against docs.sellfy.com:
 *  - Webhooks (CONFIRMED, docs.sellfy.com/article/127-webhooks): seven
 *    real, documented events — `New order`, `Email subscribe`,
 *    `Email unsubscribe`, `Subscription product bought`,
 *    `Subscription product canceled`, `Cart abandoned`,
 *    `Contact form submitted` — delivered as a plain HTTP POST with a
 *    documented JSON payload per event (no signature-verification scheme is
 *    documented on that page).
 *  - oEmbed (CONFIRMED, docs.sellfy.com/article/348-oembed): a real, public,
 *    **unauthenticated** GET endpoint —
 *    `https://sellfy.com/oembed/?url={product_or_store_url}` — returning
 *    `{ title, thumbnail_url, html, provider_name, ... }` for any Sellfy
 *    product/store URL. No API key is involved.
 *  - "API token" (per docs.sellfy.com/article/124-zapier): Sellfy's own
 *    Zapier integration page states a user must create an API token to
 *    authenticate their account for that integration — CONFIRMING an
 *    account-level credential mechanism exists.
 *
 * **THIS IS THE MOST UNCERTAIN OF THE SIX ADAPTERS THIS PASS — genuinely,
 * not silently.** Despite the token mechanism above being real, Sellfy's
 * public documentation (docs.sellfy.com, its own help-center) discloses NO
 * general REST API base URL, no authenticated endpoint, and no request/
 * response shape for products or orders anywhere this pass could find —
 * api-registration.md §2.3's own instruction for Sellfy is "verify current
 * API availability", and the honest finding this pass is: **there is
 * nothing to verify beyond webhooks and the unauthenticated oEmbed call.**
 * Per prompt.md constraint #2 ("never invent an endpoint"), this adapter
 * therefore has NO `publish`/`update`/`unpublish`/`pullOrders`/
 * `fetchBlueprints`/`fetchCosts`/`submitFulfilment`/`fetchEarnings` methods
 * — only `handleWebhook` (real, confirmed payload shapes) exists as a write
 * capability, and `verifyCredentials` (below) is honestly NOT a credential
 * check at all, just the closest real, confirmed call available.
 *
 * `canAutomate: true` is justified narrowly, the same way Prodigi's doc
 * comment justifies its own reduced capability set: real order-event
 * ingestion via a confirmed, documented webhook mechanism is genuine
 * automation, even though it is push-only (Sellfy calls OmniSell, OmniSell
 * never calls Sellfy for anything but the unauthenticated oEmbed check).
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md):
 *  - `verifyCredentials` calls the real, confirmed oEmbed endpoint against
 *    `Ctx.externalAccountId` (the tenant's own Sellfy store URL, the same
 *    field-reuse pattern WooCommerce/Printify/Gelato use) purely as a
 *    "is this a real, reachable Sellfy store" connectivity check — **it does
 *    NOT validate `Ctx.accessToken`/the pasted API token at all**, because no
 *    documented endpoint accepts that token for validation. This is
 *    explicitly weaker than every other adapter's `verifyCredentials` and is
 *    flagged loudly here, in the code, and in docs/CONNECTORS.md rather than
 *    silently presented as a real credential check.
 *  - No numeric published rate limit was found (no REST API to rate-limit
 *    against was even found) — the registry row's `rateLimit` is a nominal
 *    placeholder for the webhook-delivery path only.
 */

const OEMBED_URL = 'https://sellfy.com/oembed/';
const DOCS_URL = 'https://docs.sellfy.com/';

const capabilities: ConnectorCapabilities = {
  canAutomate: true, // narrowly justified by real webhook ingestion — see doc comment
  canPublish: false, // no confirmed product-creation endpoint exists anywhere in Sellfy's public docs
  canUpdate: false,
  canUnpublish: false,
  canSyncOrders: true, // via the confirmed "New order" webhook only — no pull/poll endpoint exists
  canFulfil: false,
  canFetchCost: false,
  canFetchEarnings: false,
  supportsWebhooks: true,
  supportsSandbox: false,
  ordersMechanism: 'webhook',
};

export const sellfyAdapter: ConnectorAdapter = {
  slug: 'sellfy',
  capabilities,

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    if (ctx.externalAccountId === undefined) {
      return {
        ok: false,
        accountLabel: null,
        scopes: [],
        latencyMs: Date.now() - startedAt,
        message: 'No Sellfy store URL on file (Ctx.externalAccountId) to check reachability against',
      };
    }
    // Deliberately NOT an authenticated call — see the loud uncertainty flag
    // in this file's doc comment. This only proves the configured store URL
    // is a real, reachable Sellfy storefront.
    const embed = await fetchJson<{ title?: string; provider_name?: string }>(
      `${OEMBED_URL}?url=${encodeURIComponent(ctx.externalAccountId)}`,
    );
    return {
      ok: true,
      accountLabel: embed.title ?? null,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: `Sellfy store URL is reachable (oEmbed responded${embed.title !== undefined ? ` for "${embed.title}"` : ''}) — this does NOT confirm the API token itself, see adapter doc comment`,
    };
  },

  async handleWebhook(_ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]> {
    // Sellfy's own webhooks doc does not document an event-type header or a
    // shared `type` field across its seven event payloads — each event has
    // its own distinct shape (confirmed live this pass). This adapter
    // therefore discriminates by the fields actually present rather than
    // inventing a header/field name Sellfy never documented.
    const body = req.body as { transaction_id?: string; amount?: unknown; cart_id?: string; plan?: unknown; created_at?: string; timestamp?: string };
    const type = body.transaction_id !== undefined && body.amount !== undefined
      ? 'new_order'
      : body.cart_id !== undefined
        ? 'cart_abandoned'
        : body.plan !== undefined
          ? 'subscription_event'
          : 'unknown';
    return [
      {
        type,
        externalOrderId: body.transaction_id ?? null,
        occurredAt: body.created_at ?? body.timestamp ?? new Date().toISOString(),
        raw: body,
      },
    ];
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Sellfy', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Sellfy', error);
  },
};
