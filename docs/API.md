# API — OmniSell /v1

OpenAPI 3.1 document: `GET /v1/openapi.json` (auto-generated via Nest + OpenAPI decorators — not
yet wired; tracked as `docs/DEBT.md` 0-D9).

## Served today (Phase 5 — Orders, Fulfilment & Digital Delivery, on top of everything below)

Every tenant-scoped route below enforces `JwtAuthGuard` + `TenantContextGuard`; RBAC-gated ones are
noted. `/hooks/*` and `/deliveries/redeem/*` carry no OmniSell session by design — see
`OrderWebhooksController`/`DeliveriesController`'s own doc comments.

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /v1/orders` | Unified order feed — filters (`status[]`, `connectorSlug`, `search`, `placedFrom/To`), cursor pagination | Bearer + tenant |
| `GET /v1/orders/export` | CSV export of the same filter set | Bearer + tenant |
| `GET /v1/orders/exceptions` | Exception queue (cursor-paginated) | Bearer + tenant |
| `POST /v1/orders/exceptions/:id/acknowledge` \| `/resolve` | Exception triage actions | Bearer + tenant + RBAC (`update OrderException`) |
| `GET/POST /v1/orders/saved-views` | Saved order-feed filter views (per user) | Bearer + tenant |
| `GET/POST /v1/orders/routing-rules`, `POST /v1/orders/routing-rules/:id` | Auto-routing rule CRUD (cheapest/fastest/region/stock-provider) | Bearer + tenant + RBAC (`FulfilmentRoutingRule`) |
| `GET/POST /v1/orders/message-templates` | Buyer message template CRUD | Bearer + tenant + RBAC (`BuyerMessageTemplate`) |
| `GET /v1/orders/:id` | Order detail — items, fees, exceptions, fulfilments/shipments/tracking, activity | Bearer + tenant |
| `POST /v1/orders` | Manual/digital-only order creation — auto-grants digital entitlements for digital line items | Bearer + tenant + `Idempotency-Key` + RBAC (`create Order`) |
| `POST /v1/orders/:id/fulfil` | Submit fulfilment — routing engine picks a provider when `connectionId` is omitted | Bearer + tenant + `Idempotency-Key` + RBAC (`create Fulfilment`) |
| `POST /v1/orders/:id/hold` \| `/release` \| `/cancel` | Status-machine transitions (featureslist.md 6.3) — cancel fires the points-redemption-refund wiring | Bearer + tenant + RBAC (`update Order`) |
| `POST /v1/orders/:id/returns`, `.../returns/:returnId/decision` | Return request + approve/reject | Bearer + tenant (+RBAC for decision) |
| `POST /v1/orders/:id/refund` | Issue a refund with cost attribution — a full refund transitions the order to `REFUNDED` | Bearer + tenant + `Idempotency-Key` + RBAC (`create Refund`) |
| `POST /v1/orders/:id/reprint` | Request a reprint | Bearer + tenant + `Idempotency-Key` + RBAC (`create Reprint`) |
| `POST /v1/orders/:id/fulfilments/:fulfilmentId/ship`, `POST /v1/orders/shipments/:shipmentId`, `.../tracking-events` | Shipment + tracking ingestion, carrier link generation | Bearer + tenant + RBAC (`update Fulfilment`) |
| `POST /v1/orders/:id/messages`, `GET .../messages` | Send/list buyer messages (shipping delay/thank-you/review request) | Bearer + tenant |
| `GET /v1/orders/:id/packing-slip`, `/invoice` | Bilingual PDF (packing slip / commercial invoice) — `?locale=en\|ar` | Bearer + tenant |
| `POST /v1/hooks/:slug/:connectionId` | Inbound order webhook receiver — HMAC-verified (best-effort, docs/DEBT.md 5-D2), idempotent by provider event id | None (connection-id + signature is the trust anchor) |
| `GET/POST /v1/digital-products`, `GET/POST /v1/digital-products/:id` | Digital product CRUD | Bearer + tenant + RBAC (`DigitalProduct`) |
| `POST /v1/digital-products/:id/files`, `POST /v1/digital-files/:id/versions` | File + append-only version registration (reuses Phase 2's upload pipeline) | Bearer + tenant + RBAC |
| `GET/POST /v1/entitlements`, `POST /v1/entitlements/:id/revoke` | Entitlement CRUD (order/customer → digital product) | Bearer + tenant + RBAC |
| `POST /v1/entitlements/:id/deliveries`, `POST /v1/deliveries/:id/resend` | Issue a TTL+IP+download-capped signed delivery URL / resend | Bearer + tenant |
| `GET /v1/entitlements/:id/delivery-log`, `GET /v1/delivery-log` | Delivery audit log | Bearer + tenant |
| `GET /v1/deliveries/redeem/:token` | Public redemption — validates cap/TTL/IP, logs, 302-redirects to a fresh presigned URL | None (opaque token is the sole credential) |
| `POST /v1/digital-products/:id/licences`, `GET .../licences`, `POST /v1/licences/:id/revoke` | Licence key generation/list/revoke | Bearer + tenant + RBAC (`LicenceKey`) |
| `POST /v1/licences/activate`, `/deactivate` | Licence key device activation (activation-limit enforced) | Bearer + tenant |
| `GET/POST /v1/coupons`, `POST /v1/coupons/:id` | Coupon CRUD (%/fixed/BOGO, usage caps, expiry, per-channel) | Bearer + tenant + RBAC (`Coupon`) |
| `POST /v1/coupons:redeem` | Redeem a coupon with idempotency — usage/customer/channel/expiry checks inside one transaction | Bearer + tenant + `Idempotency-Key` |
| `GET /v1/admin/order-exceptions/breached` | Platform-wide SLA-breach board (every tenant) | Bearer + `AdminOnlyGuard` |

`RedemptionService.computeMath` (Phase 4.5) now resolves a real `Order.subtotalMinor` when `orderId`
is supplied to `POST /v1/wallet/redeem`/`redeem/confirm` — see `docs/DEBT.md` 4.5-D6 (closed).
Task 5.12 (Etsy/Shopify/WooCommerce/Gumroad/Payhip/Sellfy connector adapters) status is recorded in
`docs/phases/PHASE_5_REPORT.md` and `docs/CONNECTORS.md`. See `docs/DEBT.md` 5-D1 through 5-D11 for
exactly what is real code vs. unverifiable in this sandbox (no live provider credentials, no Docker,
no device/browser).

## Served today (Phase 4.5 — Points Economy, on top of everything below)

Full spec: `docs/points-extension.md`. Every mutating endpoint enforces tenant scoping via
`TenantContextGuard`; RBAC-gated routes are noted explicitly.

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /v1/wallet` | Derived balance, today's-earned-vs-cap, lifetime earned/spent, next expiry | Bearer + tenant |
| `GET /v1/wallet/transactions` | Cursor-paginated `PointTransaction` history (`?type=`, `?dateFrom=`, `?dateTo=`) | Bearer + tenant |
| `GET /v1/wallet/earning-rules` | Active `PointEarningRule`s for the tenant | Bearer + tenant |
| `POST /v1/wallet/earn/video-watch` | Thin alias over the canonical watch pipeline — never credits an unverified `watchSeconds` | Bearer + tenant |
| `POST /v1/wallet/redeem` | Redemption preview only — nothing is deducted | Bearer + tenant |
| `POST /v1/wallet/redeem/confirm` | Deducts points, posts a balanced `LedgerEntry`/`LedgerLine` pair, confirms the `ProductPurchaseWithPoints` | Bearer + tenant + `Idempotency-Key` |
| `POST /v1/wallet/redeem/refund` | Restores points via a new `EARN` row + a reversing ledger entry — the seam Phase 5 calls on order cancellation | Bearer + tenant + RBAC (`update ProductPurchaseWithPoints`) |
| `POST /v1/video-watches` | Starts a server-tracked watch session (`{videoId}` → `{watchId, heartbeatsMs}`) | Bearer + tenant |
| `POST /v1/video-watches/:id/heartbeat` | Server-received-timestamp gap accounting; rejects with `WATCH_FRAUD_SUSPECT` on a fraud signal | Bearer + tenant |
| `POST /v1/video-watches/:id/complete` | Runs the two award gates (min-seconds AND ≥60% duration), awards points (real BullMQ enqueue with an inline synchronous fallback — see `docs/DEBT.md` 4.5-D2) | Bearer + tenant |
| `GET /v1/videos` | Active `VideoContent` for the consumer feed | Bearer + tenant |
| `GET /v1/videos/all` | All videos including archived — moderation view | Bearer + tenant + RBAC (`read VideoContent`) |
| `GET /v1/videos/:id` | One video's detail | Bearer + tenant |
| `POST /v1/videos` | Create — `durationSeconds` always server-probed via real `ffprobe`, never a client value (`uploadSessionId` or external `url`) | Bearer + tenant + RBAC (`create VideoContent`) |
| `PATCH /v1/videos/:id` | Edit title/thumbnail/points override/active | Bearer + tenant + RBAC (`update VideoContent`) |
| `DELETE /v1/videos/:id` | Archive (never a hard delete) | Bearer + tenant + RBAC (`delete VideoContent`) |
| `GET /v1/videos/blob/:sessionId` | Streams bytes from the resumable-upload scratch storage (disk-backed stand-in, same class as 2-D2) | Bearer + tenant |
| `GET /v1/points/rules` | List all `PointEarningRule`s (including inactive) | Bearer + tenant + RBAC (`read PointEarningRule`) |
| `PUT /v1/points/rules` | Upsert one rule by `action` | Bearer + tenant + RBAC (`update PointEarningRule`) |
| `GET/PUT /v1/points/settings` | `TenantPointSettings` (rate, floor, share cap, expiry, redemption toggle) | Bearer + tenant + RBAC |
| `GET /v1/points/fraud-queue` | `FRAUD_SUSPECT` watches with their signal breakdown | Bearer + tenant + RBAC (`read VideoContent`) |
| `POST /v1/points/fraud-queue/:watchId/approve` | Approve → `VALIDATED` + credit, mandatory note, audit-trailed | Bearer + tenant + RBAC (`update PointTransaction`) |
| `POST /v1/points/fraud-queue/:watchId/reject` | Reject → stays `FRAUD_SUSPECT`, any prior credit `REVERSED`, mandatory note, audit-trailed | Bearer + tenant + RBAC (`update PointTransaction`) |
| `POST /v1/points/adjust` | Manual `ADJUST` — mandatory reason code + note, never mutates a validated row | Bearer + tenant + RBAC (`update PointTransaction`) |

`PointTransactionRepository` enforces a DB-level `@@unique([tenantId, source, sourceId])` constraint
as the idempotent double-award guard beneath every award/spend/adjust path — see
`docs/DEBT.md` 4.5-D1–4.5-D12 for exactly what is real code vs. unverifiable in this sandbox
(no Redis, no device/browser, an SSRF hardening gap on the external-video-URL fetch path).

## Served today (Phase 4 — Publishing Pipeline & Export Packs, on top of everything below)

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /v1/listings` | List this tenant's listings — `?status=`, `?view=REJECTED_OR_ERROR\|SCHEDULED` | Bearer + tenant |
| `GET /v1/listings/:id` | Full detail: variants, overrides, activity timeline | Bearer + tenant |
| `POST /v1/listings` | Composer create — one `Listing` row per selected channel | Bearer + tenant + `Idempotency-Key` |
| `PATCH /v1/listings/:id` | Edit a non-LIVE listing's fields/schedule | Bearer + tenant |
| `POST /v1/listings:dry-run` | Renders the EXACT per-channel payload (`adapter.buildPublishPayload`) or Export Pack text preview — no queue/HTTP call | Bearer + tenant |
| `POST /v1/listings:publish` | Multi-channel publish in one action — hard-blocks on IP/trademark policy violation before creating anything | Bearer + tenant + `Idempotency-Key` |
| `POST /v1/listings:bulk` | Bulk publish/unpublish/reprice/retag/resync/delete | Bearer + tenant + `Idempotency-Key` |
| `POST /v1/listings:bulk-undo-reprice` | Restores the previous price/currency from a bulk reprice's undo token | Bearer + tenant |
| `POST /v1/listings/:id/retry` | One-click replay for a listing in `ERROR` | Bearer + tenant + `Idempotency-Key` |
| `POST /v1/listings/:id/submit-for-approval` | DESIGNER submits (featureslist.md 5.10) | Bearer + tenant |
| `POST /v1/listings/:id/approval-decision` | OWNER/ADMIN approve/reject with a comment | Bearer + tenant |
| `POST /v1/listings/:id/comments` | Adds a `ListingEvent` (type `COMMENT`) — the approval thread | Bearer + tenant |
| `GET /v1/listings/:id/drift` | Real channel-vs-local comparison (`{supported:false}` today — no adapter implements `fetchListingState` yet) | Bearer + tenant |
| `POST /v1/listings/:id/drift/resolve` | Accept the channel's version, overwrite local fields | Bearer + tenant |
| `POST /v1/listings/:id/drift/force-push` | Re-send local state to the channel | Bearer + tenant |
| `GET /v1/sync-jobs` | List this tenant's `SyncJob`s | Bearer + tenant |
| `GET /v1/sync-jobs/:id/snapshot` | One-shot JSON snapshot (initial paint before opening the SSE stream) | Bearer + tenant |
| `GET /v1/sync-jobs/:id` | **SSE stream** — the publish pipeline view's live per-channel job cards | Bearer + tenant |
| `POST /v1/sync-jobs/:id/replay` | Replays every FAILED/DLQ item in a job via `ConnectorQueueService.replay` | Bearer + tenant |
| `GET /v1/admin/queues/dead-letter` | DLQ across every connector queue | Bearer + platform admin |
| `POST /v1/admin/queues/:slug/jobs/:jobId/replay` | Replay one DLQ job | Bearer + platform admin |
| `GET /v1/export-packs` | List this tenant's Export Packs | Bearer + tenant |
| `POST /v1/export-packs` | Generate a real ZIP (print files resized to spec, mockups, metadata.csv, field-cards.html, CHECKLIST.md in the requested locale) | Bearer + tenant + `Idempotency-Key` |
| `GET /v1/export-packs/:id/download` | Streams the ZIP bytes | Bearer + tenant |
| `POST /v1/export-packs/:id/confirm` | Marks manual upload confirmed — `Listing` transitions to `LIVE` | Bearer + tenant + `Idempotency-Key` |
| `GET /v1/banned-terms` | Active banned-term dictionary (read-only, every tenant sees the same rows) | Bearer + tenant |
| `GET/POST/PATCH/DELETE /v1/admin/banned-terms*` | Admin CRUD on the global IP/trademark dictionary | Bearer + platform admin |

`POST /listings:dry-run` and `POST /listings:publish` share the exact same field-transform engine
(`apps/api/src/publishing/transform/field-transform.engine.ts`) and the exact same
`PublishInputBuilderService` + `adapter.buildPublishPayload()` call — a dry-run preview cannot
diverge from what a real publish call sends. The Tier C boundary (`canAutomate(connector)`'s
type-guard narrowing to `AutomatableConnector`) is enforced inside `PublishOrchestratorService`
itself, not re-checked by these routes. See `docs/DEBT.md` 4-D1–4-D13 for exactly what is real
code vs. unverifiable in this sandbox (no Redis, no live object storage, no browser).

## Served today (Phase 3 — Connector Framework, on top of everything below)

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /v1/connectors` | Capability matrix data — every non-quarantined `ConnectorDefinition` | Bearer + tenant |
| `GET /v1/connectors/:slug` | One connector's registry row | Bearer + tenant |
| `GET /v1/admin/connectors` | Every registry row, including quarantined (Tier D) ones | Bearer + platform admin |
| `POST /v1/admin/connectors` | Create a registry row | Bearer + platform admin + `Idempotency-Key` |
| `PATCH /v1/admin/connectors/:slug` | Update a registry row (tier/status/capabilities/rateLimit/fieldSpec/URLs) | Bearer + platform admin |
| `PATCH /v1/admin/connectors/:slug/quarantine` | Quarantine toggle (`status` ⇄ `UNVERIFIED`) | Bearer + platform admin |
| `PATCH /v1/admin/connectors/:slug/verify` | Records `verifiedAt`/`verifiedBy` per api-registration.md §7 | Bearer + platform admin |
| `GET /v1/connections` | List this tenant's connections (masked credential hint only) | Bearer + tenant |
| `POST /v1/connections` | Create a connection — API_KEY/PAT tests inline; OAuth2 creates `PENDING` | Bearer + tenant + `Idempotency-Key` |
| `GET /v1/connections/:id/oauth/start` | Builds the PKCE authorize URL, persists `ConnectorOAuthState` | Bearer + tenant |
| `GET /v1/oauth/callback/:slug` | Provider OAuth callback — **no Bearer guard** (state token is the trust anchor, see `ConnectorOAuthCallbackController`'s doc comment); redirects the browser back into the app | none — state-validated |
| `POST /v1/connections/:id/test` | Real `verifyCredentials()` call through the adapter + rate limiter | Bearer + tenant |
| `GET /v1/connections/:id/health` | Aggregated `ConnectionHealthSample` view (last success, error rate, latency, rate-limit headroom, token expiry) | Bearer + tenant |
| `POST /v1/connections/:id/rotate` | Rotate the stored credential, re-tests immediately | Bearer + tenant + `Idempotency-Key` |
| `DELETE /v1/connections/:id` | Disconnect; body `{retention: 'KEEP_ORPHAN'\|'PURGE'}` | Bearer + tenant |
| `POST /v1/blueprints/sync` | Real provider catalog sync via `fetchBlueprints()` into `Blueprint`/`BlueprintVariant` — replaces Phase 2's hand-seed | Bearer + tenant + `Idempotency-Key` |

Only four connectors have a real adapter this phase — Printful, Printify, Gelato, Prodigi
(`packages/connectors`). `POST /connections` refuses any connector whose registry row has
`capabilities.canAutomate !== true` before a row is even created (brb.md §6's hard rule, enforced
at the first possible moment, mirrored again inside `AdapterRunnerService.resolve` at call time).
See `docs/CONNECTORS.md` for per-provider auth/endpoint notes and `docs/DEBT.md` for what's
genuinely unverifiable in this sandbox (no live network access to a real provider account).

## Served today (Phase 2 — Studio & Catalog, on top of everything in Phase 1)

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /v1/assets/upload-init` | Start a presigned or resumable upload; creates the `Asset` row | Bearer + tenant + `Idempotency-Key` |
| `PATCH /v1/assets/upload-sessions/:id` | Append a chunk (`{offsetBytes, chunkBase64}`) to a resumable session | Bearer + tenant |
| `POST /v1/assets/upload-sessions/:id/complete` | Finalise a resumable upload — runs real sharp metadata extraction | Bearer + tenant |
| `POST /v1/assets/:id/complete` | Finalise a presigned upload with client-observed metadata | Bearer + tenant |
| `GET /v1/assets` | List assets (cursor-paginated, filterable: folder/collection/starred/colour/tag/search/kind) | Bearer + tenant |
| `GET /v1/assets/:id` | Asset detail + version history | Bearer + tenant |
| `PATCH /v1/assets/:id` | Update name/folder/starred/colour label/tags | Bearer + tenant |
| `DELETE /v1/assets/:id` | Soft-delete an asset | Bearer + tenant |
| `POST /v1/assets/:id/rollback` | Roll back to a prior version (appends a new version, never rewrites history) | Bearer + tenant |
| `POST /v1/assets/:id/preflight` | Run the print-file preflight engine, optionally against a blueprint print area | Bearer + tenant |
| `POST /v1/folders` / `GET /v1/folders` | Folder CRUD (single-parent containment) | Bearer + tenant |
| `POST /v1/collections` / `GET /v1/collections` | Collection CRUD (cross-cutting grouping) | Bearer + tenant |
| `POST /v1/collections/:id/assets` / `DELETE .../assets/:assetId` | Add/remove an asset from a collection | Bearer + tenant |
| `GET /v1/mockup-templates` | List mockup templates | Bearer + tenant |
| `POST /v1/mockups/compose` | Synchronously composite a design onto a mockup template (needs live object storage — `503` in this sandbox, docs/DEBT.md 2-D4) | Bearer + tenant |
| `GET /v1/assets/:assetId/mockups` | List mockup renders for an asset | Bearer + tenant |
| `GET /v1/blueprints` / `GET /v1/blueprints/:id` | Provider catalog cache (hand-seeded this phase, docs/DEBT.md 0-D8) | Bearer + tenant |
| `POST /v1/products` | Create a product (internal SKU, decoupled from any channel listing) | Bearer + tenant + `Idempotency-Key` |
| `GET /v1/products` | List products (cursor-paginated, status/search filters) | Bearer + tenant |
| `GET /v1/products/export.csv` | Export the full catalog as CSV | Bearer + tenant |
| `POST /v1/products/import.csv` | Import a CSV catalog (`{csv: string}` body — 2-D10) | Bearer + tenant |
| `GET /v1/products/:id` | Product detail (variants + placements) | Bearer + tenant |
| `PATCH /v1/products/:id` | Update basic product fields | Bearer + tenant |
| `POST /v1/products/:id/variants:bulk` | Generate the variant matrix from selected sizes × colours | Bearer + tenant |
| `PATCH /v1/products/:id/variants:bulk` | Bulk enable/disable variants | Bearer + tenant |
| `POST /v1/products/:id/duplicate` | Duplicate a product (optionally including variants/placements) | Bearer + tenant + `Idempotency-Key` |
| `POST /v1/products/:id/archive` | Archive with dependency guard (seam only — no `Listing` model yet, docs/DEBT.md 2-D8) | Bearer + tenant |
| `GET /v1/products/:id/placements` / `POST .../placements` | Design→placement mapping (position/scale/rotation per print area) | Bearer + tenant |
| `DELETE /v1/products/:id/placements/:placementCode` | Remove a placement | Bearer + tenant |
| `POST /v1/products/:id/placements/save-template` | Save the product's current placements as a reusable template | Bearer + tenant |
| `GET /v1/placement-templates` | List reusable placement templates | Bearer + tenant |
| `POST /v1/products/:id/placements/apply-template` | Apply a saved template's geometry to a product + asset | Bearer + tenant |
| `POST /v1/pricing-rules` / `GET /v1/pricing-rules` | Pricing rule CRUD (cost-plus/fixed-margin/target-price, rounding, per-channel multiplier, per-currency floor) | Bearer + tenant |
| `PATCH /v1/pricing-rules/:id` | Update a pricing rule | Bearer + tenant |
| `POST /v1/pricing-rules/:id/apply` | Apply a saved rule to a base cost, returns the computed price | Bearer + tenant |
| `POST /v1/pricing/preview` | Live margin preview + waterfall (no persistence) — backs the product builder's live preview and the margin waterfall chart | Bearer + tenant |

## Served today (Phase 1)

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /v1/healthz` | Liveness | none |
| `GET /v1/readyz` | Readiness (db/redis/storage) | none |
| `POST /v1/auth/register` | Email/password signup — creates a `Tenant` + `OWNER` | none |
| `POST /v1/auth/login` | Password login — returns tokens or `{ mfaRequired: true, challengeToken }` | none |
| `POST /v1/auth/refresh` | Rotate a refresh token | none (refresh token) |
| `POST /v1/auth/verify-email` | Consume an email-verification token | none (token) |
| `POST /v1/auth/password-reset/request` / `/confirm` | Password reset flow | none |
| `GET /v1/auth/me` | Current user profile | Bearer |
| `GET /v1/auth/sessions` / `DELETE /v1/auth/sessions/:id` | List/revoke device sessions | Bearer |
| `POST /v1/auth/mfa/setup` | Generate a TOTP secret (not yet enabled) | Bearer |
| `POST /v1/auth/mfa/verify` | Activate MFA, returns 10 recovery codes | Bearer + `Idempotency-Key` |
| `POST /v1/auth/mfa/challenge` | Exchange a login challenge token + code for real tokens | none (challenge token) |
| `POST /v1/auth/mfa/disable` | Disable MFA | Bearer |
| `GET /v1/auth/oauth/:provider/start` | Google/Apple auth URL | none — `501 oauth_provider_not_configured` until real credentials are set (docs/DEBT.md 1-D2) |
| `GET /v1/auth/oauth/callback/:provider` | OAuth callback → tokens | none |
| `GET /v1/tenants` | Orgs the caller belongs to (org switcher) | Bearer |
| `GET /v1/tenants/:id` | Tenant detail | Bearer + `x-tenant-id` |
| `GET /v1/tenants/:id/members` | Member list | Bearer + `x-tenant-id` |
| `PATCH /v1/members/:id` / `DELETE /v1/members/:id` | Change role / remove member | Bearer + `x-tenant-id` |
| `POST /v1/tenants/:id/invites` | Send an invite | Bearer + `x-tenant-id` + `Idempotency-Key` |
| `GET /v1/tenants/:id/invites` | List pending/accepted/revoked/expired invites | Bearer + `x-tenant-id` |
| `POST /v1/tenants/:id/invites/:inviteId/revoke` / `/resend` | Manage a pending invite | Bearer + `x-tenant-id` |
| `POST /v1/invites/accept` | Accept an invite (matching email required) | Bearer |
| `GET /v1/feature-flags` | Effective flags for the caller's tenant | Bearer + `x-tenant-id` |
| `GET /v1/feature-flags/definitions` | All flag definitions (platform-admin) | Bearer + platform admin |
| `POST /v1/feature-flags` | Create a flag definition (platform-admin) | Bearer + platform admin + `Idempotency-Key` |
| `PUT /v1/feature-flags/:key` | Update a flag definition (platform-admin) | Bearer + platform admin |
| `PUT /v1/feature-flags/:key/tenants/:tenantId` / `DELETE .../tenants/:tenantId` | Per-tenant override | Bearer + tenant OWNER/ADMIN (own tenant) or platform admin (any tenant) |
| `GET /v1/notifications` | Cursor-paginated in-app notifications | Bearer + `x-tenant-id` |
| `PATCH /v1/notifications/:id/read` | Mark read | Bearer + `x-tenant-id` |
| `GET /v1/preferences` / `PATCH /v1/preferences` | Per-type notification preferences | Bearer + `x-tenant-id` |
| `GET /v1/openapi.json` | OpenAPI document | not yet wired (0-D9) |

## Conventions (prompt.md)
- Cursor pagination (`?cursor=&limit=`) — `limit` clamps to 100 rather than rejecting an
  over-large request.
- `Idempotency-Key` required on mutating POSTs. Where no natural DB unique constraint exists,
  `apps/api/src/common/idempotency/idempotency.service.ts` provides a generic store (a replayed
  key + identical body returns the original response; a replayed key + different body is a 409).
- RFC 9457 `application/problem+json` errors. Any deliberately-thrown exception (including a
  non-500 5xx like `501 oauth_provider_not_configured`) carries a real `detail` + optional
  machine-readable `code`; a genuinely unhandled exception or an explicit generic `500` never
  leaks detail.
- `x-tenant-id` header selects the active org for tenant-scoped routes (org switcher); falls back
  to the caller's earliest active membership when absent.
- `X-Request-Id` echoed on every response.
- `429` with `Retry-After` (not yet exercised by any route in this pass).
- Resumable-upload chunks (`PATCH /v1/assets/upload-sessions/:id`) use a JSON `{offsetBytes, chunkBase64}` envelope rather than the real tus wire protocol's raw octet-stream body — the offset-tracking semantics are real (a mismatched offset is rejected), only the wire format is scoped down (docs/OPEN_QUESTIONS.md #22, docs/DEBT.md 2-D3).

_This file grows with each phase._
