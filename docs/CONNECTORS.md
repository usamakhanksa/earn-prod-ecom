# Connectors — Registration & Verification

- **Rule:** a connector adapter ships only with a *live public API documentation URL*
  recorded on the `ConnectorDefinition` row (`apiDocsUrl`).
- **Tier C** connectors (Redbubble, Merch by Amazon, Society6, TeePublic, Threadless,
  Design By Humans) receive an **Export Pack generator** — never an automation adapter.
  The type system enforces the boundary (`packages/connectors`): `publish()` only accepts
  `AutomatableConnector` (capabilities.canAutomate: true).
- **Tier D** rows stay `status: UNVERIFIED` until a documented API is confirmed.

Full credential acquisition walkthroughs: `api-registration.md`.

## Blueprint cache (Phase 2 → Phase 3)

`Blueprint`/`BlueprintVariant` (`GET /v1/blueprints`) is the provider-catalog CACHE prompt.md's
data model calls for. Phase 2 hand-seeded it; **Phase 3 replaces that with a real sync**:
`POST /v1/blueprints/sync` (`apps/api/src/catalog/blueprints/blueprint-sync.service.ts`) calls
the connected adapter's `fetchBlueprints()` and upserts into the exact same tables via the exact
same repository methods (`upsertSeed`/`upsertVariant`) Phase 2 used — no second migration.

This is real, tested logic (`test/blueprint-sync.service.test.ts` proves the mapping/upsert against
a fake adapter's canned `Blueprint[]`) that **cannot complete against a live provider in this
sandbox** — no tenant here has a real, credentialed `CONNECTED` connection, and this environment
has no live network access to a real Printful/Printify/Gelato/Prodigi account even if one existed.

## Phase 3 — the four real adapters

Every row below was verified **live** on 2026-08-11/12 via `WebFetch`/`WebSearch` against each
provider's actual developer-docs domain — not guessed, not copied from memory alone. What was
verified live vs. what remains open is called out explicitly per provider. None of the four
adapters were exercised against a real authenticated sandbox call in this pass (no credentials
exist here) — see `docs/DEBT.md` for the precise scope of "exists" this phase.

### Printful

| | |
|---|---|
| Tier / status | A / `BETA` (see "Why BETA, not ACTIVE" below) |
| Auth | OAuth 2.0 (multi-tenant SaaS path, implemented: `buildAuthUrl`/`exchangeCode`/`refresh`) **or** a private token pasted directly as the API-key credential — both work identically since Printful accepts either as a Bearer token |
| Base URL (confirmed live) | `https://api.printful.com/` |
| `apiDocsUrl` | https://developers.printful.com/docs/ |
| `tosUrl` | https://www.printful.com/policies/terms-of-service |
| Webhooks | Confirmed supported (order lifecycle, product sync, stock) |
| Rate limit used | 120 req / 60s, burst 20 — a conservative estimate, not independently confirmed against Printful's own published numeric limit this pass |

**Uncertainty flagged** (`packages/connectors/src/adapters/printful.ts`'s doc comment): the exact
OAuth authorize/token endpoint paths (`www.printful.com/oauth/authorize` / `/oauth/token`) and the
`{code, result}` response envelope on every REST call follow Printful's long-stable v1 API shape
from training-time knowledge, cross-checked against the live docs page's existence today — but no
live authenticated call confirmed the literal field names this pass. `canFetchEarnings` is `false`
by design: Printful is a fulfilment provider, not a marketplace with an earnings surface.

### Printify

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | Personal Access Token (Bearer). OAuth2 also exists for multi-merchant platforms but this adapter uses the PAT path per api-registration.md's own recommendation |
| Base URL (confirmed live) | `https://api.printify.com/v1/` (a v2 catalog surface also exists; v1 is confirmed sufficient and used here) |
| `apiDocsUrl` | https://developers.printify.com/ |
| `tosUrl` | https://printify.com/terms-of-service/ (a separate, more specific `https://printify.com/api-terms/` also exists — not used as the registry's single `tosUrl` this pass) |
| Confirmed endpoints | `GET /v1/shops.json`, `GET /v1/catalog/blueprints.json`, `GET /v1/shops/{shop_id}/orders.json` |
| Rate limit used | 100 req / 60s, burst 20 — conservative estimate, not independently confirmed |

**Uncertainty flagged**: the blueprint → print-provider → variant three-level sub-paths
(`/v1/catalog/blueprints/{id}/print_providers.json`, then `.../print_providers/{id}/variants.json`)
and the `send_to_production.json` submission path follow Printify's well-known, stable v1 URL
convention but were not re-confirmed against a live authenticated call this pass (no PAT
available here). `fetchCosts` deliberately does NOT call an invented `/costs` endpoint — Printify's
cost figure ships inline on the variants response already used by `fetchBlueprints`.

### Gelato

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | `X-API-KEY` header (confirmed) |
| Base URLs (confirmed live, three distinct subdomains) | `order.gelatoapis.com` (orders), `product.gelatoapis.com/v3` (global catalog — confirmed path `v3/catalogs`), `ecommerce.gelatoapis.com/v1` (a tenant's own store products — confirmed path `v1/stores/{storeId}/products`, and a confirmed `ecommerce/products/create-from-template` doc page) |
| `apiDocsUrl` | https://dashboard.gelato.com/docs/ (returned HTTP 403 to a direct sandbox fetch — likely bot/JS-gated — but its indexed sub-pages were confirmed live via search results pointing at this same host) |
| `tosUrl` | https://www.gelato.com/legal/api-terms |
| Rate limit used | 60 req / 60s, burst 10 — conservative estimate, not independently confirmed |

**Uncertainty flagged — genuinely open, not guessed silently**: Gelato's architecture summary
mentions a distinct "pricing and stock" surface separate from the product catalog, but its exact
hostname/version was never confirmed live. `fetchCosts` therefore reads the `price` field already
present on a `products:search` result instead of inventing an unconfirmed pricing endpoint. The
orders API version (`v4`) and the exact webhook-registration path are inferred from Gelato's
general versioning pattern, not independently re-confirmed.

### Prodigi

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | `X-API-Key` header (confirmed — Prodigi's own quick-start curl example uses exactly this header). **Separate sandbox and live keys** (api-registration.md §2.1) — `Ctx.accessToken` holds whichever key matches `Ctx.sandbox` |
| Base URLs (confirmed live) | Sandbox `https://api.sandbox.prodigi.com/v4.0`, Live `https://api.prodigi.com/v4.0` |
| `apiDocsUrl` | https://www.prodigi.com/print-api/docs/reference/ |
| `tosUrl` | https://www.prodigi.com/terms-of-use/ |
| Confirmed endpoints | `POST /v4.0/Orders` (Prodigi's own docs show this exact curl example); a `Quotes` endpoint exists (confirmed via search) |
| Rate limit used | 60 req / 60s, burst 10 — conservative estimate, not independently confirmed |

**Deliberate capability gap — not an oversight**: Prodigi is a pure fulfilment API (a merchant's
own store calls into it) with **no public storefront-listing endpoint** in its documented API.
`capabilities.canPublish/canUpdate/canUnpublish` are `false` and the adapter has no `publish`/
`update`/`unpublish` methods at all — attaching fabricated ones would violate prompt.md constraint
#2. `canAutomate` stays `true` because order submission and cost/catalog lookups are real,
live-documented automation.

**Uncertainty flagged**: Prodigi's public docs show single-SKU product lookup (`GET /Products/{sku}`)
but no confirmed bulk "list the whole catalog" endpoint — `fetchBlueprints` therefore syncs a
caller-supplied SKU seed list (`Ctx.externalAccountId`, reused as a comma-separated SKU list) rather
than inventing a catalog-list call. The exact webhook/callback payload shape for order-status
changes was not independently confirmed live either.

## Phase 4 SDK additions — `buildPublishPayload` and `fetchListingState`

Two optional `ConnectorAdapter` members were added this phase, both additive (no existing adapter
signature changed):

- **`buildPublishPayload(ctx, input)`** — the exact wire body `publish()`/`update()` send, with no
  HTTP call. Printful/Printify/Gelato (the three with `canPublish: true`) each expose it by
  delegating to the SAME private payload-builder function `publish()` itself already called — one
  implementation, two call sites, never two. `apps/api/src/publishing/dry-run.service.ts` calls this
  for the dry-run endpoint (implentationplanphase.md task 4.4); `packages/connectors/test/printful
  .adapter.test.ts`'s "byte-for-byte" test proves the preview can never drift from what a real
  `publish()` call sends. Prodigi has none (no `publish` to mirror).
- **`fetchListingState(ctx, externalId)`** — the channel's live view of one already-published
  listing, for drift detection (task 4.13). NOT implemented by any of the four real adapters this
  pass — no live-doc-confirmed single-listing "get" endpoint was independently re-verified for any
  of them (prompt.md constraint #2 forbids guessing one). `DriftDetectionService.check()` returns a
  real, honest `{ supported: false }` today; see `docs/DEBT.md` 4-D3.

## Why `status: 'BETA'`, not `'ACTIVE'`, for all four

api-registration.md §7's mandatory verification protocol has ten checklist items. This pass could
complete: opening the live docs, opening the live ToS, confirming the auth mechanism, and recording
`apiDocsUrl`/`tosUrl`. It could **not** complete: creating a real sandbox/test account, making a
real authenticated call for every claimed capability, confirming exact numeric rate limits, or
obtaining a **human's** legal sign-off (`verifiedBy` on these four seed rows names this build pass,
explicitly documented as not a person — see the seed file's comment). `status: 'BETA'` records this
honestly: real, live-confirmed docs and real adapter code, but short of the full protocol needed
before `'ACTIVE'`. See `docs/OPEN_QUESTIONS.md` and `docs/DEBT.md`.

## Tier C — Redbubble (a real, now-visible Export Pack channel, Phase 4)

Phase 3 seeded Redbubble as a `status: 'UNVERIFIED'` boundary-proof row only. Phase 4's own exit
criterion needs "a Redbubble Export Pack a user can actually follow to upload manually", so this
pass promoted it to a real, visible `status: 'BETA'` Tier C row (docs/OPEN_QUESTIONS.md #35) with a
sourced `fieldSpec` (docs/DEBT.md 4-D5):

| Field | Value | Source |
|---|---|---|
| `maxTags` | 15 (50 chars each) | **Confirmed** — Redbubble's own July 2023 "new tagging limits" blog announcement (blog.redbubble.com) |
| Image spec | ≥3840×3840px, ≥150 DPI, PNG/JPEG | Aggregated from Redbubble's help-center guidance (help.redbubble.com itself returned 403 to `WebFetch` this pass; figures cross-checked via topbubbleindex.com/icons8.com, which cite the same help-center numbers). Redbubble's own hard ceiling is 13,500×13,500px / 300MB |
| `maxTitle` / `maxDescription` | 120 / 1000 (ESTIMATES) | **Not confirmed** — no official character-cap source was found this pass; flagged as an estimate in the seed row's own code comment, same honesty standard as 3-D7's rate-limit estimates |

`capabilities.canAutomate: false` and `apiDocsUrl: null` are unchanged — Redbubble has no public
write API and never will have adapter code (brb.md §6's hard rule). `packages/connectors/src/adapters`
still has exactly four files (`printful.ts`, `printify.ts`, `gelato.ts`, `prodigi.ts`); Redbubble is
the concrete Tier C target the real `ExportPackGeneratorService`/`buildExportPack` builder (task
4.12) targets instead — see `apps/api/test/export-pack-builder.test.ts` for the real, unzip-verified
proof.

## Tier D boundary-proof row (not a shipped connector)

**SunFrog** (Tier D, `status: UNVERIFIED`) exists purely to exercise the admin quarantine screen
against real, non-fabricated data — per api-registration.md §5, dead/unverifiable. No adapter code
exists or ever will. `GET /v1/connectors` (the tenant-facing capability matrix) hides `UNVERIFIED`
rows by default, so SunFrog stays invisible to ordinary users unless the admin registry screen
explicitly asks for everything.

## Six more adapters (bounded follow-up pass, 2026-08-16)

A later, bounded follow-up pass (not a full phase) added six more real adapters —
`packages/connectors/src/adapters/{etsy,shopify,woocommerce,gumroad,payhip,sellfy}.ts` — following
the exact `ConnectorAdapter` pattern the original four established, each verified live this pass via
`WebFetch`/`WebSearch` against its own real developer-docs domain (never guessed from memory alone,
per prompt.md constraint #2). All six are seeded as Tier A / `status: 'BETA'` in
`apps/api/prisma/connector-registry-seed.ts`, the same honest reasoning as the original four's "Why
`status: 'BETA'`" section above: live docs/ToS/auth confirmed, but no real sandbox account, no real
authenticated call, and no human legal sign-off exist in this sandbox. 91 MSW-mocked unit tests pass
package-wide this pass (up from 52 before this follow-up — see `docs/DEBT.md`'s new consolidated
entry), each provider getting a happy-path test plus at least one realistic failure mode.

### Etsy

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | OAuth 2.0 + PKCE (mandatory S256 challenge). Authorize `https://www.etsy.com/oauth/connect`, token `https://api.etsy.com/v3/public/oauth/token` — both confirmed live via WebFetch against developer.etsy.com's own authentication page |
| Base URL (confirmed live) | `https://openapi.etsy.com/v3/application` — every call also requires an `x-api-key` header carrying the app's keystring, alongside the `Authorization: Bearer` token (Etsy v3's own documented dual-header requirement) |
| `apiDocsUrl` | https://developers.etsy.com/documentation/ |
| `tosUrl` | https://www.etsy.com/legal/api/ |
| Scopes (confirmed) | `address_r/w`, `email_r`, `listings_r/w/d`, `profile_r/w`, `shops_r/w`, `transactions_r/w` |
| Rate limit | **CONFIRMED, not an estimate** — 10 requests/second, 10,000 requests/24h sliding window (developer.etsy.com/documentation/essentials/rate-limits/) |

**Production access is NOT self-serve** — repeated here per this task's own instruction not to
pretend otherwise: a new Etsy app only gets a small number of unreviewed calls until a human submits
it for Etsy's own app review. This adapter's OAuth plumbing is real and will work the moment a
reviewed `ETSY_OAUTH_CLIENT_ID`/`ETSY_OAUTH_CLIENT_SECRET` exist — the review step itself cannot be
automated or bypassed.

**Uncertainty flagged**: `createDraftListing`/`updateListing`/`deleteListing` endpoint paths are
confirmed to exist by name via WebSearch against Etsy's own open-api GitHub discussions, but the
exact request-body field names and the tracking-submission endpoint used for `submitFulfilment`
follow Etsy's long-documented v3 shape from training-time knowledge, not independently re-verified
via a live authenticated call this pass. Etsy is a marketplace, not a print-catalog provider, so
`fetchBlueprints`/`fetchCosts` are deliberately not implemented (same reasoning Prodigi's own gap
uses). Etsy has no documented webhook mechanism — `ordersMechanism: 'poll'`.

### Shopify

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | **Custom-app Admin API access token** (chosen over the OAuth public-app path — see "why" below) |
| Base URL (confirmed live) | `https://{shop}.myshopify.com/admin/api/2026-07/graphql.json` (Admin **GraphQL** API; version string will need periodic bumping, Shopify ships a new dated version quarterly) |
| Auth header (confirmed) | `X-Shopify-Access-Token` |
| `apiDocsUrl` | https://shopify.dev/docs/api/admin-graphql |
| `tosUrl` | https://www.shopify.com/legal/api-terms |
| Rate limit | Shopify's real limiter is a cost-based points bucket, not a flat req/s count — the registry row's number is a rough approximation of that budget, not a literal published figure |

**Why custom-app token, not OAuth public app**: api-registration.md's own guidance says exactly this
("Custom app token is faster for early users"). The OAuth public-app path additionally requires
Shopify App Store review plus implementing Shopify's mandatory GDPR webhook trio before an app can
even be submitted — real, material overhead this pass explicitly did not build. This adapter has no
`buildAuthUrl`/`exchangeCode`/`refresh` methods as a result — the merchant pastes their own Admin API
token directly, the same PAT-style pattern Printify uses.

**Uncertainty flagged**: the `productCreate`/`productUpdate`/`productDelete`/`orders`/
`fulfillmentCreate` GraphQL mutation/query NAMES are confirmed to exist via the live docs page and
Shopify's published schema history, but the exact field-selection sets in this adapter were not
re-confirmed against a live authenticated call this pass (no shop/token available in this sandbox).

### WooCommerce

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | HTTP **Basic Auth** (Consumer Key as username, Consumer Secret as password) over **mandatory HTTPS** — confirmed as WooCommerce's own recommended approach for HTTPS deployments |
| Base URL (confirmed live) | `{tenant's own store URL}/wp-json/wc/v3/` — self-hosted, base URL varies per tenant (api-registration.md's own note); this adapter validates the URL is `https://` and refuses plain HTTP outright |
| `apiDocsUrl` | https://woocommerce.github.io/woocommerce-rest-api-docs/ |
| `tosUrl` | https://woocommerce.com/terms-conditions/ |
| Confirmed endpoints | `GET/POST /products`, `PUT/DELETE /products/{id}`, `GET /orders` |
| Rate limit | Not a WooCommerce number at all — self-hosted platforms have no platform-wide limit to confirm. The registry row records OmniSell's own self-imposed courtesy default |

**Why Basic Auth, not OAuth1.0a HMAC signing**: WooCommerce's own docs reserve the OAuth1.0a
"one-legged" HMAC signature scheme for plain-HTTP deployments only, specifically to avoid sending
credentials in cleartext. Since this adapter refuses any non-HTTPS store URL outright (this task's
own instruction to "validate HTTPS"), that HMAC path is never reachable, and building a second,
unused signing scheme was deliberately skipped.

**Uncertainty flagged**: WooCommerce's native Webhooks resource (`X-WC-Webhook-Topic` header on
delivered payloads) and the `?force=true` permanent-delete query param are long-stable, well-known
WooCommerce v3 conventions, not independently re-confirmed via a fresh live fetch this specific pass.
There is no fulfilment or earnings concept in WooCommerce **core** REST (both are extension/plugin
territory in real installs) — `canFulfil`/`canFetchEarnings` are `false` with no methods, rather than
guessing a plugin-specific endpoint that may not be installed on a given tenant's site.

### Gumroad

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | OAuth 2.0 (implemented) **or** a manually-generated application access token for a user's own account (api-registration.md's own recommendation) — both send as `Authorization: Bearer` |
| Base URL (confirmed live) | `https://api.gumroad.com/v2` |
| `apiDocsUrl` | https://help.gumroad.com/docs/api/01-overview |
| `tosUrl` | https://gumroad.com/terms |
| Scopes (CONFIRMED by name) | `view_profile`, `edit_products`, `view_sales`, `view_payouts`, `mark_sales_as_shipped`, `edit_sales` |
| Confirmed endpoints | `GET/POST /v2/products`, `GET /v2/sales` (filterable, paginated via `page_key`) |
| Rate limit | Conservative estimate — no numeric published limit found this pass |

**Uncertainty flagged**: the OAuth authorize/token endpoint hosts follow Gumroad's long-documented,
stable pattern from training-time knowledge (a direct fetch of the authorize URL 404'd in this
sandbox, expected since it needs query params). The `{success, ...}` response envelope and the exact
`PUT/DELETE /v2/products/{id}` and `PUT /v2/sales/{id}/mark_as_shipped` paths follow Gumroad's
long-stable v2 conventions and documented scope names but were not independently re-verified via a
live authenticated call. `refresh()` is a documented no-op — no confirmed refresh-token grant flow
was found; Gumroad tokens are documented as long-lived. `view_payouts` has a confirmed scope but no
confirmed endpoint path — `fetchEarnings` is deliberately not implemented rather than guessing one.

### Payhip

| | |
|---|---|
| Tier / status | A / `BETA` |
| Auth | API key, header `payhip-api-key` (coupon endpoints) — a separate `product-secret-key` header exists for license-key endpoints, not used by this adapter |
| Base URL (confirmed live) | `https://payhip.com/api/v2` |
| `apiDocsUrl` | https://payhip.com/api-reference |
| `tosUrl` | https://payhip.com/terms |
| Confirmed endpoints | `GET/POST /coupons`, `GET /coupons/:id`, `GET /license/verify`, `PUT /license/enable\|disable\|usage\|decrease` |
| Confirmed webhook events | `paid`, `refunded`, `subscription.created`, `subscription.deleted`, with a real documented `paid` payload shape |

**api-registration.md §2.3 flagged this one explicitly** ("Confirm write capability; may be
read/reporting-oriented") — and the honest finding this pass is that Payhip's own public API
reference documents **no product/listing or orders/sales-list endpoint at all**, only coupon
management and software-license-key operations. This adapter therefore has NO `publish`/`update`/
`unpublish`/`pullOrders`/`fetchBlueprints`/`fetchCosts`/`submitFulfilment` methods — attaching
fabricated ones would violate prompt.md constraint #2. `canAutomate` stays `true` because coupon
management is real, live-documented automation (the same honest reasoning Prodigi's own capability
gap uses); the confirmed `paid` webhook is the ONLY way OmniSell can observe a Payhip sale at all —
there is no pull/poll fallback.

### Sellfy

| | |
|---|---|
| Tier / status | A / `BETA` — **the most uncertain of the six adapters this pass** |
| Auth | API key ("API token" per Sellfy's own Zapier integration page — confirmed to exist as a mechanism, but no documented endpoint validates it) |
| Confirmed real mechanisms | Webhooks (docs.sellfy.com/article/127-webhooks — 7 real documented events: New order, Email subscribe/unsubscribe, Subscription bought/canceled, Cart abandoned, Contact form submitted) and the public, **unauthenticated** oEmbed endpoint `https://sellfy.com/oembed/?url=...` (docs.sellfy.com/article/348-oembed) |
| `apiDocsUrl` | https://docs.sellfy.com/ |
| `tosUrl` | https://sellfy.com/terms/ |

**api-registration.md §2.3 flagged this one too** ("Verify current API availability") — and this
pass's honest finding, after a live WebFetch/WebSearch pass against docs.sellfy.com and third-party
API trackers, is that **there is no general public REST API to verify**: no base URL, no
authenticated endpoint, and no request/response shape for products or orders exists anywhere in
Sellfy's public documentation. This adapter therefore has NO `publish`/`update`/`unpublish`/
`pullOrders`/`fetchBlueprints`/`fetchCosts`/`submitFulfilment`/`fetchEarnings` methods — only
`handleWebhook` (real, confirmed payload discrimination by field shape, since Sellfy documents no
shared event-type header or field) exists as a write capability. `canAutomate: true` is justified
narrowly by real webhook-based order ingestion, the same way Prodigi's reduced capability set is
justified by real fulfilment/catalog automation despite no publish capability.

**`verifyCredentials` is honestly NOT a credential check** — this is called out loudly in the
adapter's own doc comment, not silently presented as equivalent to the other nine adapters' live
auth checks. It calls the real, confirmed, unauthenticated oEmbed endpoint against the tenant's
configured store URL purely to prove the store is reachable; it does **not** validate the pasted API
token at all, because no documented endpoint accepts that token for anything.

## Verified live 2026-08-11/12 — what "verified" means here

This sandbox has outbound network access (confirmed via `WebFetch`/`WebSearch`/a direct `node
fetch` smoke test), which is NOT guaranteed for every future pass. Where a live fetch/search
succeeded, the exact confirmed URL and finding is recorded above with today's date. Where it did
not (Gelato's docs host itself, gated) or where a specific field/endpoint shape genuinely could not
be confirmed, that is flagged explicitly in the adapter's own doc comment AND here — never guessed
silently, per prompt.md's instruction.

## Verified live 2026-08-16 — the six-more-adapters follow-up pass

Same standard as above, applied to Etsy/Shopify/WooCommerce/Gumroad/Payhip/Sellfy: every
`apiDocsUrl`/`tosUrl` recorded in this section and in the registry seed was opened live via
`WebFetch`/`WebSearch` this pass. Etsy's numeric rate limit is the first of the ten adapters to be a
CONFIRMED published figure rather than a conservative estimate. Payhip and Sellfy are the two
providers api-registration.md §2.3 itself flagged as uncertain, and both were genuinely gated down
to a reduced, honest capability set after live verification rather than seeded with the generic
"full automation" capability block the other eight use — see each provider's section above.

_This file grows with each phase._
