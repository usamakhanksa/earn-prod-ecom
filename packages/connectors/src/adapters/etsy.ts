import { createHash } from 'node:crypto';
import type { ConnectorCapabilities } from '@omnisell/shared';
import type { ConnectorAdapter } from '../adapter';
import type {
  AuthCtx,
  Ctx,
  Fulfilment,
  FulfilInput,
  HealthResult,
  NormalisedOrder,
  Page,
  PublishInput,
  PublishResult,
  TokenSet,
  UpdateInput,
} from '../types';
import { fetchJson, ConnectorHttpError, extractBodyMessage } from '../http';
import { mapHttpStatusToError, mapNetworkError } from '../error-mapper';

/**
 * Etsy adapter (api-registration.md §2.2 / docs/CONNECTORS.md).
 *
 * Verified live 2026-08-16 via WebFetch against
 * https://developers.etsy.com/documentation/essentials/authentication/ and
 * WebSearch against the Etsy Open API v3 reference:
 *  - Auth: OAuth 2.0 Authorization Code grant with **mandatory** PKCE (S256).
 *    Authorize: `https://www.etsy.com/oauth/connect` (confirmed). Token:
 *    `https://api.etsy.com/v3/public/oauth/token` (confirmed).
 *  - Every REST call ALSO requires an `x-api-key` header carrying the app's
 *    keystring (Etsy's own client_id) alongside the `Authorization: Bearer`
 *    token — this is Etsy v3's well-documented dual-header requirement, not
 *    a guess.
 *  - Scopes are granular and confirmed: `address_r`, `address_w`, `email_r`,
 *    `listings_r`, `listings_w`, `listings_d`, `profile_r`, `profile_w`,
 *    `shops_r`, `shops_w`, `transactions_r`, `transactions_w`. Request the
 *    minimum needed (api-registration.md's own instruction).
 *  - Rate limit CONFIRMED (not a conservative estimate like the Phase 3
 *    four): 10,000 requests / 24h (sliding window) and 10 requests/second,
 *    per developer.etsy.com/documentation/essentials/rate-limits/.
 *  - Confirmed endpoint paths (base `https://openapi.etsy.com/v3/application`):
 *    `GET /shops/{shop_id}`, `GET /shops/{shop_id}/listings`,
 *    `GET /shops/{shop_id}/receipts` (requires `transactions_r`).
 *
 * **PRODUCTION ACCESS IS NOT SELF-SERVE** (api-registration.md's own
 * warning, repeated here per this task's explicit instruction not to pretend
 * otherwise): a new Etsy app only gets a small number of unreviewed calls in
 * a "draft"/keystring-only state. Etsy requires a human to submit the app
 * for review before it can make production calls against real shops. This
 * adapter's OAuth plumbing is real and will work the moment a reviewed
 * `ETSY_OAUTH_CLIENT_ID`/`ETSY_OAUTH_CLIENT_SECRET` pair exists — the
 * approval step itself cannot be automated or bypassed by OmniSell.
 *
 * UNCERTAINTY FLAGGED (docs/CONNECTORS.md):
 *  - `createDraftListing` (`POST /shops/{shop_id}/listings`) and
 *    `updateListing` (`PATCH /shops/{shop_id}/listings/{listing_id}`) are
 *    confirmed to exist by name/path via WebSearch against Etsy's own
 *    open-api GitHub discussions, but the exact request body field names
 *    used below (`quantity`, `taxonomy_id`, `price`) follow Etsy's
 *    long-documented v3 listing shape from training-time knowledge — no
 *    live authenticated call confirmed the literal envelope this pass.
 *  - `deleteListing` (`DELETE /listings/{listing_id}`) is Etsy's
 *    well-known v3 delete endpoint, used here for `unpublish`, but was not
 *    independently re-confirmed via a fresh docs fetch this specific pass.
 *  - `POST /shops/{shop_id}/receipts/{receipt_id}/tracking` (used for
 *    `submitFulfilment`) is Etsy's documented "add tracking" mechanism from
 *    training-time knowledge, cross-checked against the live receipts
 *    tutorial page's existence, but not re-verified field-by-field.
 *  - No earnings/payment-ledger endpoint was confirmed this pass (Etsy does
 *    have a Payment Account Ledger Entries surface, but its exact path
 *    wasn't independently re-verified) — `canFetchEarnings` stays `false`
 *    and no `fetchEarnings` method exists, rather than guessing one.
 *  - Etsy has no formally documented webhook/callback mechanism in v3 —
 *    `supportsWebhooks: false`, `ordersMechanism: 'poll'`.
 *  - Etsy is a marketplace a seller lists arbitrary items on, not a
 *    print-catalog provider — there is no "blueprint" catalog to sync, so
 *    `fetchBlueprints`/`fetchCosts` are deliberately not implemented
 *    (`canFetchCost: false`), the same reasoning Prodigi's doc comment uses
 *    for its own deliberate capability gaps.
 */

const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const BASE_URL = 'https://openapi.etsy.com/v3/application';
const DOCS_URL = 'https://developers.etsy.com/documentation/';

const capabilities: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: true,
  canFetchCost: false, // marketplace, not a print-catalog provider — see doc comment
  canFetchEarnings: false, // no ledger endpoint independently confirmed this pass
  supportsWebhooks: false, // no documented webhook mechanism in Etsy Open API v3
  supportsSandbox: false,
  ordersMechanism: 'poll',
};

function authHeaders(ctx: Ctx): Record<string, string> {
  return {
    authorization: `Bearer ${ctx.accessToken ?? ''}`,
    // Etsy v3 requires the app keystring on every call, independent of the
    // bearer token — carried here via the OAuth client id env var, matching
    // how Printful's OAuth client id is read (process.env, not stored on Ctx).
    'x-api-key': process.env.ETSY_OAUTH_CLIENT_ID ?? '',
    'content-type': 'application/json',
  };
}

function shopId(ctx: Ctx): string {
  if (ctx.externalAccountId === undefined) {
    throw new Error('Etsy calls require a resolved shop_id (Ctx.externalAccountId) — call verifyCredentials/list shops first');
  }
  return ctx.externalAccountId;
}

/** PKCE S256 challenge derived from the caller-supplied `code_verifier`
 * (RFC 7636) — the verifier itself is generated by the caller (`apps/api`'s
 * OAuth flow), this adapter only derives the challenge Etsy's authorize URL
 * expects. */
function codeChallengeFrom(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export const etsyAdapter: ConnectorAdapter = {
  slug: 'etsy',
  capabilities,

  buildAuthUrl(ctx: AuthCtx): string {
    if (ctx.codeVerifier === undefined) {
      throw new Error('Etsy requires PKCE — AuthCtx.codeVerifier must be set before buildAuthUrl is called');
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.ETSY_OAUTH_CLIENT_ID ?? '',
      redirect_uri: ctx.redirectUri,
      scope: 'listings_r listings_w listings_d shops_r shops_w transactions_r transactions_w',
      state: ctx.state,
      code_challenge: codeChallengeFrom(ctx.codeVerifier),
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeCode(ctx: AuthCtx, code: string): Promise<TokenSet> {
    if (ctx.codeVerifier === undefined) {
      throw new Error('Etsy requires PKCE — AuthCtx.codeVerifier must be set before exchangeCode is called');
    }
    const body = await fetchJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ETSY_OAUTH_CLIENT_ID ?? '',
        redirect_uri: ctx.redirectUri,
        code,
        code_verifier: ctx.codeVerifier,
      }).toString(),
    });
    return buildTokenSet(body.access_token, body.refresh_token, body.expires_in);
  },

  async refresh(_ctx: AuthCtx, tokenSet: TokenSet): Promise<TokenSet> {
    const body = await fetchJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ETSY_OAUTH_CLIENT_ID ?? '',
        refresh_token: tokenSet.refreshToken ?? '',
      }).toString(),
    });
    return buildTokenSet(body.access_token, body.refresh_token ?? tokenSet.refreshToken, body.expires_in);
  },

  async verifyCredentials(ctx: Ctx): Promise<HealthResult> {
    const startedAt = Date.now();
    const shop = await fetchJson<{ shop_id: number; shop_name: string }>(`${BASE_URL}/shops/${shopId(ctx)}`, {
      headers: authHeaders(ctx),
    });
    return {
      ok: true,
      accountLabel: shop.shop_name,
      scopes: [],
      latencyMs: Date.now() - startedAt,
      message: `Connected to Etsy shop "${shop.shop_name}"`,
    };
  },

  buildPublishPayload(_ctx: Ctx, input: PublishInput): unknown {
    return toListingPayload(input);
  },

  async publish(ctx: Ctx, input: PublishInput): Promise<PublishResult> {
    const listing = await fetchJson<{ listing_id: number }>(`${BASE_URL}/shops/${shopId(ctx)}/listings`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify(toListingPayload(input)),
    });
    return { externalId: String(listing.listing_id), statusUrl: `${BASE_URL}/listings/${listing.listing_id}` };
  },

  async update(ctx: Ctx, input: UpdateInput): Promise<PublishResult> {
    const listing = await fetchJson<{ listing_id: number }>(`${BASE_URL}/shops/${shopId(ctx)}/listings/${input.externalId}`, {
      method: 'PATCH',
      headers: authHeaders(ctx),
      body: JSON.stringify(toListingPayload(input)),
    });
    return { externalId: String(listing.listing_id), statusUrl: `${BASE_URL}/listings/${listing.listing_id}` };
  },

  async unpublish(ctx: Ctx, externalId: string): Promise<void> {
    await fetchJson<unknown>(`${BASE_URL}/listings/${externalId}`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
    });
  },

  async pullOrders(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>> {
    const offset = cursor !== undefined ? Number.parseInt(cursor, 10) : 0;
    const limit = 25;
    const body = await fetchJson<{
      count: number;
      results: Array<{
        receipt_id: number;
        status: string;
        name: string | null;
        buyer_email?: string | null;
        grandtotal: { amount: number; divisor: number; currency_code: string };
        transactions: Array<{ listing_id: number; quantity: number; price: { amount: number; divisor: number } }>;
        created_timestamp: number;
      }>;
    }>(`${BASE_URL}/shops/${shopId(ctx)}/receipts?limit=${limit}&offset=${offset}`, { headers: authHeaders(ctx) });
    const items = body.results.map((receipt) => ({
      externalOrderId: String(receipt.receipt_id),
      status: receipt.status,
      buyerName: receipt.name,
      buyerEmail: receipt.buyer_email ?? null,
      currency: receipt.grandtotal.currency_code,
      totalMinor: BigInt(Math.round((receipt.grandtotal.amount / receipt.grandtotal.divisor) * 100)),
      items: receipt.transactions.map((t) => ({
        externalVariantId: String(t.listing_id),
        quantity: t.quantity,
        priceMinor: BigInt(Math.round((t.price.amount / t.price.divisor) * 100)),
        currency: receipt.grandtotal.currency_code,
      })),
      createdAt: new Date(receipt.created_timestamp * 1000).toISOString(),
    }));
    return { items, nextCursor: items.length === limit ? String(offset + limit) : null };
  },

  async submitFulfilment(ctx: Ctx, input: FulfilInput): Promise<Fulfilment> {
    // No tracking number/carrier is carried on `FulfilInput` yet — this posts
    // the documented "mark as shipped" call with an empty tracking body
    // rather than inventing tracking fields OmniSell doesn't have.
    const body = await fetchJson<{ receipt_id: number }>(`${BASE_URL}/shops/${shopId(ctx)}/receipts/${input.externalOrderId}/tracking`, {
      method: 'POST',
      headers: authHeaders(ctx),
      body: JSON.stringify({}),
    });
    return {
      externalFulfilmentId: String(body.receipt_id),
      status: 'SUBMITTED',
      trackingNumber: null,
      trackingUrl: null,
      carrier: null,
    };
  },

  mapError(error: unknown) {
    if (error instanceof ConnectorHttpError) {
      return mapHttpStatusToError({ status: error.status, slug: 'Etsy', docsUrl: DOCS_URL, bodyMessage: extractBodyMessage(error.bodyText) });
    }
    return mapNetworkError('Etsy', error);
  },
};

function buildTokenSet(accessToken: string, refreshToken: string | undefined, expiresInSeconds: number | undefined): TokenSet {
  return {
    accessToken,
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(expiresInSeconds !== undefined ? { expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() } : {}),
  };
}

function toListingPayload(input: PublishInput): unknown {
  return {
    quantity: 1,
    title: input.title,
    description: input.description,
    tags: input.tags.slice(0, 13), // Etsy caps tags at 13 (long-documented, stable limit)
    price: input.variants[0] !== undefined ? Number(input.variants[0].priceMinor) / 100 : 0,
    who_made: 'i_did',
    when_made: 'made_to_order',
    taxonomy_id: 0,
    images: input.images.map((image) => image.url),
  };
}
