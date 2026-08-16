# Phase 3 — Connector Framework + First 4 Integrations · Report

**Scope:** implentationplanphase.md tasks 3.1–3.13 — `ConnectorDefinition`/`ConnectorVersion`
registry + seeder, credential vault (envelope encryption), OAuth 2.0 + PKCE and API-key/PAT
connection flows, the `ConnectorAdapter` SDK + the compile-time Tier-C automation boundary, a
per-connector rate limiter, BullMQ queue topology, four real adapters (Printful, Printify, Gelato,
Prodigi), MSW-mocked unit tests + nightly contract-test scaffolding, the connection wizard +
capability matrix + connection health board (web), the admin connector registry CRUD screen, and
the token auto-refresh worker.

## Status: IMPLEMENTED (backend + web + admin; live-provider-network paths honestly stubbed/gated
— see "Still stubbed" below)

Exit criteria from implentationplanphase.md: *"a real design publishes to Printful, Printify,
Gelato, and Prodigi from one action; failures are legible; credentials are encrypted and unreadable
in the DB dump; capability matrix renders truthfully."* Publishing itself (the "one action" that
fans out to all four) is Phase 4 scope — what this phase delivers is everything Phase 4 needs to
call into: real adapters, a real credential vault, a real rate limiter, and a UI that shows the
truth about what each connector can and cannot automate. The Phase 3 gate — *"the
`AutomatableConnector` type constraint must compile-block Tier C automation before any Tier C
connector row exists"* — is met and proven (see "The Tier C boundary" below); the two Tier C/D rows
that DO exist in the seed exist specifically to exercise that boundary against real data, not as
shipped connectors.

## What shipped

### The Connector SDK (`packages/connectors`)

Rebuilt from the Phase 1/2 stub into the full shape prompt.md specifies:
- **`src/types.ts`** — every data shape the SDK interface references (`Ctx`, `AuthCtx`, `TokenSet`,
  `Blueprint`, `CostQuote`, `PublishInput`/`Result`, `NormalisedOrder`, `Fulfilment`,
  `ConnectorError`, etc.), pure data, no Prisma/NestJS.
- **`src/adapter.ts`** — `ConnectorAdapter` interface exactly per prompt.md's "CONNECTOR SDK"
  section, plus **the Tier C boundary** (see below).
- **`src/error-mapper.ts`** — shared HTTP-status → `ConnectorError` mapping (auth expired,
  validation, rate-limited, provider-unavailable, malformed response) every adapter's `mapError`
  builds on.
- **`src/rate-limiter.ts`** — `TokenBucket`, `computeBackoffMs` (exponential + jitter), `withRetry`,
  and `ConnectorRateLimiter` (one bucket per connector, round-robin per-tenant fairness queue) —
  task 3.5, pure logic, fake-timer-tested.
- **`src/vault/envelope.ts`** — AES-256-GCM envelope encryption primitives (`generateDek`,
  `wrapDek`/`unwrapDek`, `encryptSecret`/`decryptSecret`, `rewrapDek`, `maskSecret`,
  `assertSecretNotPresent`) — task 3.2's crypto core, no I/O, the most heavily tested file in this
  phase.
- **`src/adapters/{printful,printify,gelato,prodigi}.ts`** — the four real adapters (task 3.7,
  detailed below).
- **`src/http.ts`** — a tiny shared `fetchJson`/`ConnectorHttpError` wrapper every adapter uses.

#### The Tier C boundary (the gate this whole phase is judged against)

```ts
export type AutomatableConnector = Connector & { capabilities: ConnectorCapabilities & { canAutomate: true } };
export function publish(connector: AutomatableConnector, adapter: ConnectorAdapter, ctx: Ctx, input: PublishInput): Promise<PublishResult>;
```
A connector whose `capabilities.canAutomate` is anything other than the literal `true` cannot be
passed to `publish()` without lying to the compiler (`as unknown as AutomatableConnector`) —
enforced by the intersection type, not a runtime `if`. `packages/connectors/test/automation-boundary.test.ts`
is the canonical proof: a fully-populated Tier C `ConnectorCapabilities` object, an `expectTypeOf`
assertion that it does NOT match `AutomatableConnector`, a runtime tripwire proof
(`expect(() => publish(evil as unknown as AutomatableConnector, ...)).toThrow()`), AND a real
`// @ts-expect-error` block proving the everyday case — passing the Tier C object to `publish()`
directly, no cast — fails to compile, full stop. This closes `docs/DEBT.md` 1-D18 (the pre-existing
bug where this exact test both failed `tsc` and threw unguarded at runtime).

The boundary is mirrored a second time at the data layer, per brb.md §6's "enforced twice" spirit:
`ConnectionsService.create` refuses to create a `Connection` row for any registry row whose
`capabilities.canAutomate !== true` (a `ForbiddenException`, before any credential is even
requested), and `AdapterRunnerService.resolve` refuses again at call time even if a row somehow
existed. Two seed rows exist purely to exercise this against real (non-fabricated) data — see
"Tier C/D boundary-proof rows" below.

### Credential vault (task 3.2)

`packages/connectors/src/vault/envelope.ts` (pure crypto) + `apps/api/src/vault/credential-vault.service.ts`
(the Prisma-aware wrapper, the only place plaintext ever exists in `apps/api`, and only for one
call's duration):
- Per-tenant DEK, generated once, envelope-encrypted by `KMS_MASTER_KEY`, stored on a new
  `TenantDataKey` row.
- Every `Credential.encryptedBlob` uses a fresh random IV per write (never deterministic).
- `maskedHint()` produces `sk_live_••••4821`-style hints — the only human-readable trace of a
  secret anywhere in the system.
- `rotateMasterKeyWrap()` re-wraps a tenant's DEK under a new master-key value without touching any
  `Credential` row — the real, sufficient meaning of "key rotation" in an envelope scheme.
- **No-log assertion test** (`packages/connectors/test/envelope.test.ts` +
  `apps/api/test/credential-vault.service.test.ts`): builds a representative logged/serialized
  object shaped like a real audit-log `after` snapshot and asserts the raw secret never appears in
  it — and proves the assertion helper itself isn't a tautology by deliberately logging the secret
  in a second case and confirming the check catches it.

### OAuth 2.0 + PKCE / API-key/PAT connection flows (task 3.3)

`apps/api/src/connections/` — a different concern from Phase 1's `apps/api/src/oauth/` (that
authorises a *person* signing in; this authorises a *connector* for an already-known tenant), but
sharing the PKCE/state-validation shape:
- `ConnectionsService.create` — API_KEY/PAT: encrypts the pasted secret, tests it inline via the
  real adapter, saves. OAuth2: creates a `PENDING` row with no credential yet.
- `ConnectionsService.startOAuth` — mints a PKCE `code_verifier` + a single-use `state`, persists
  `ConnectorOAuthState` (with an expiry), returns the provider's real authorize URL.
- `ConnectorOAuthCallbackController` (`GET /v1/oauth/callback/:slug`) — **no `JwtAuthGuard`** (a
  provider redirect carries no session header); the single-use `state` token is the trust anchor,
  and the callback validates that the `state` was minted for the SAME connector slug it's being
  redeemed against (the **callback allowlist** task 3.3 calls for) before exchanging the code.
- Rotation (`POST /connections/:id/rotate`) and disconnect (`DELETE /connections/:id` with a
  `KEEP_ORPHAN`/`PURGE` retention choice) are both real, audited, idempotency-keyed endpoints.

### Per-connector rate limiter (task 3.5)

`ConnectorRateLimiter` (token bucket + adaptive backoff/jitter + per-tenant round-robin fairness) —
one instance per connector slug, lazily created and reused by `AdapterRunnerService`, config
sourced from the registry's `rateLimit` JSON. 11 unit tests including a fake-timer-driven proof
that a burst from tenant A does not starve a single request from tenant B behind all of it.

### BullMQ queue topology (task 3.6)

`apps/api/src/queue/connector-queue.service.ts` — one real BullMQ `Queue` per connector slug
(printful/printify/gelato/prodigi) + a shared `connector-dlq` queue, per-connector concurrency
config, `enqueue`/`listFailed`/`replay`/`moveToDlq`/`startWorker` — same honest-stub standard every
prior phase's queue/worker gaps held themselves to (Phase 1's notification realtime, Phase 2's
`NoopMockupRenderQueue`): this is real, callable code that cannot actually move a job through Redis
here (no Docker). Two real bugs were found and fixed while getting it to boot cleanly — see "Bugs
found" below. `/v1/readyz`'s `redis` check now does a real, time-boxed ping instead of the
hardcoded `'degraded'` string Phase 0/1 left as a placeholder (closes `docs/DEBT.md` 0-D5).

### Token auto-refresh worker + expiry alerting (task 3.13)

`TokenRefreshService.runSweep()` — finds `Credential` rows expiring within a window, decrypts,
calls the adapter's real `refresh()`, re-encrypts, writes back a new active credential row; when no
refresh token was ever stored (or refresh fails) it fires a real in-app `SECURITY` notification to
the connection's creator plus an audit-log row, instead of silently letting the token lapse. Fully
unit-tested (4 tests) with a mocked `getAdapter`. Only SCHEDULING is stubbed — nothing calls
`runSweep()` on a recurring basis yet; that belongs on a BullMQ repeatable job, blocked by the same
Redis gap as the queue topology.

### The four adapters (task 3.7) — see `docs/CONNECTORS.md` for full per-provider detail

| Connector | Auth | Base URL (live-confirmed) | canPublish/Update/Unpublish | Notes |
|---|---|---|---|---|
| **Printful** | OAuth2 or private token (both work identically) | `api.printful.com` | ✓ | No earnings API (fulfilment provider, not a marketplace) |
| **Printify** | PAT (Bearer) | `api.printify.com/v1` | ✓ | Shop-scoped; three-level blueprint→provider→variant hierarchy |
| **Gelato** | `X-API-KEY` | 3 subdomains: order/product/ecommerce.gelatoapis.com | ✓ | Pricing subdomain hostname unconfirmed — costs read from catalog search instead |
| **Prodigi** | `X-API-Key`, separate sandbox/live keys | `api(.sandbox).prodigi.com/v4.0` | **✗ (deliberate)** | No storefront-listing API exists — `publish`/`update`/`unpublish` are simply absent, not faked |

Every `apiDocsUrl`/`tosUrl` was opened live via `WebFetch`/`WebSearch` on 2026-08-11/12 (this
sandbox has outbound network access to public documentation, confirmed) and matches
`docs/CONNECTORS.md`'s per-provider notes, including every endpoint/field-shape uncertainty flagged
explicitly rather than guessed silently. Every adapter's `fetchBlueprints()` writes into the exact
same `Blueprint`/`BlueprintVariant` tables Phase 2 hand-seeded, via a new
`BlueprintSyncService`/`POST /v1/blueprints/sync` — no second migration needed, as Phase 2's report
promised.

### Tests (task 3.8)

- **MSW-mocked unit tests**, one file per adapter (`packages/connectors/test/*.adapter.test.ts`):
  happy path (verifyCredentials/fetchBlueprints/publish) + realistic failure modes (401 auth
  expired, 429 rate limited, malformed non-JSON response, 5xx provider-unavailable, 422
  validation).
- **Nightly sandbox contract tests** (`test/contract/*.contract.test.ts`) — real, runnable
  `describe.skipIf(!envVar)` suites per connector, gated on a real credential env var
  (`PRINTFUL_CONTRACT_TEST_TOKEN`, etc.). All four skip cleanly in this sandbox (no credentials
  exist here) — confirmed by the actual test run below (9 skipped, 0 failed).
- **apps/api integration-shaped unit tests**: `credential-vault.service`, `connections.service`,
  `adapter-runner.service`, `token-refresh.service`, `blueprint-sync.service` — 26 new tests, all
  against mocked repositories (no live DB needed, matching this codebase's established pattern).
- **`test/app-module-wiring.test.ts`** (new) — compiles the ENTIRE `AppModule` DI graph via
  `@nestjs/testing`. This is the test that would have caught two of the three real bugs below
  before a manual boot did; added as a permanent regression test, not a one-off.

### Connection wizard + capability matrix + connection health board (web, tasks 3.9–3.11)

Replaced the `(shell)/[...slug]` catch-all for exactly the three Channels destinations this phase
scopes (`/channels/connections`[`/[id]`], `/channels/capability-matrix`, `/channels/health`) — Sync
Queue and Export Packs stay on the honest "coming soon" path (Publishing is Phase 4):
- **Connections** (`app/(shell)/channels/connections/page.tsx`) — real list + a real wizard (pick
  platform from `GET /connectors` → shows real capabilities/docs link → label + sandbox toggle →
  API-key field or an OAuth redirect button → `POST /connections`, which tests inline for API-key
  connectors). The detail page (`[id]/page.tsx`) is also the OAuth callback's landing page
  (`?oauth=success|error`), and hosts test/rotate/disconnect + an embedded health snapshot.
- **Capability matrix** (`app/(shell)/channels/capability-matrix/page.tsx`, prompt.md "signature
  moment #3") — a real grid of connectors × 9 capabilities, ✓/✗ with a hover/focus tooltip
  (keyboard-accessible — an interactive `<button>`, not a `tabIndex` hack) explaining the
  degradation in plain language, sourced entirely from `GET /connectors`.
- **Connection health board** (`app/(shell)/channels/health/page.tsx`) — real
  `GET /connections/:id/health` data (last success, error rate, avg latency, rate-limit headroom,
  token-expiry countdown) for every connection, with seeded demo-tenant rows explicitly labelled
  `isSeedData`/"Demo data" in the UI per this task's own instruction (no live traffic exists yet —
  Publishing is Phase 4).

### Admin connector registry CRUD (`apps/admin`, task 3.12)

`app/(shell)/connectors/page.tsx` — real `GET/PATCH /admin/connectors*` calls: tier/status/auth-type
badges, `verifiedAt`/`verifiedBy` display, `apiDocsUrl`/`tosUrl` links, a quarantine toggle
(`status` ⇄ `UNVERIFIED`), a sandbox-support toggle (`capabilities.supportsSandbox`), and a "mark
verified" action that records a real `verifiedAt`/`verifiedBy` (prompting for a name — the schema
enforces a non-empty string but cannot mechanically enforce "is this actually a person", which is
called out as an open, process-level gap in `docs/CONNECTORS.md`).

## Bugs found and fixed while getting this pass green

Every one of these was caught by actually running the code, not review alone:

- **BullMQ queue name rejected `:`** — `connector:printful` etc. threw `Error: Queue name cannot
  contain :` the moment the compiled app was booted for real (`node dist/main.js`). Found only by
  doing that boot check, not by `tsc`/`vitest` (both passed with the bug in place — BullMQ's
  validation is a runtime check). Renamed to `connector-printful` etc.
- **ioredis retried forever with no cap** — `lazyConnect: true` alone did not stop BullMQ's `Queue`
  constructor from triggering a connection attempt; without a bounded `retryStrategy`, the
  compiled app spammed `ECONNREFUSED` indefinitely in this Redis-less sandbox. Fixed with
  `retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000))` — a handful of
  attempts, then an honest give-up, not silent infinite retry.
- **`ConnectorsModule` missing `AdminModule`** — `AdminOnlyGuard` (used by every
  `/admin/connectors*` route) could not be resolved by Nest's DI container; invisible until an
  actual boot or a full-module-graph test tried to instantiate the route pipeline (unauthenticated
  curl requests never reached the guard, since `JwtAuthGuard` rejected them first — this is exactly
  why `test/app-module-wiring.test.ts` was added as a permanent fixture, not a one-off check).
- **`ConnectorsModule`/`ConnectionsModule`/`BlueprintsModule` missing `IdempotencyModule`** — same
  discovery mechanism as above (`IdempotencyService` unresolvable). Both of the above match this
  codebase's own established pattern (`FeatureFlagModule` already imports both) — a straightforward
  omission on new modules, now fixed and now covered by a regression test.
- **`ConnectionsService` had a constructor-property/method name collision** — a `health` repository
  parameter shadowed the class's own `health()` method, caught immediately by `tsc`
  (`TS2300: Duplicate identifier`), fixed by renaming the parameter to `healthSamples`.
- **A test-design bug, not a service bug**: the first `rotateMasterKeyWrap` test tried to "rotate"
  while leaving `env.KMS_MASTER_KEY` unchanged, which doesn't model how master-key rotation
  actually happens operationally (the env var flips only AFTER rotation completes). Fixed by
  asserting the rotation directly against the envelope primitives with an explicit new key, instead
  of routing through `decryptForTenant` (which is intentionally always pinned to the current env
  value).
- **jsx-a11y caught a real accessibility bug**: the capability-matrix tooltip trigger was a
  `<span tabIndex={0}>` — `no-noninteractive-tabindex` correctly flagged this as inaccessible.
  Replaced with a real `<button type="button">` so keyboard/screen-reader users get the same
  disclosure mouse-hover users do, and fixed the Tailwind group-focus variant
  (`group-focus-within`, not `group-focus-visible`, since focus lands on the inner button, not the
  outer wrapper) to match.

## Verification performed in this environment

| Gate | Result |
|---|---|
| `packages/connectors` — build / typecheck / test | ✅ / ✅ / ✅ **52/52 passed, 9 skipped** (11 files — the 9 skips are the nightly contract tests, correctly skipping without real credentials) |
| `packages/shared` — build / typecheck / test | ✅ / ✅ / ✅ **40/40** (unchanged from Phase 2, still green) |
| `packages/api-client` — build / typecheck / test | ✅ / ✅ / ✅ **6/6** (added an optional `body` param to `.delete()` for the disconnect-with-retention-choice endpoint) |
| `packages/i18n` — build / test / en↔ar key parity | ✅ / ✅ **4/4** / ✅ **486 keys each, 0 missing either side** (+88 new this phase) |
| `packages/ui` — build / typecheck / test | ✅ / ✅ / ✅ **7/7** (unchanged) |
| `apps/api` — typecheck / `nest build` / test | ✅ 0 errors / ✅ / ✅ **166/166** (25 files; was 143 including this phase's first addition, 137 at the end of Phase 2) |
| `apps/api` — real boot (`node dist/main.js`, no DB/Redis) | ✅ every new route mapped (Connectors/Connections/ConnectorOAuthCallback/Blueprints-sync controllers), DI graph resolves cleanly (after the two module-wiring bugs above were fixed), degrades to `readyz: degraded` (db down, redis down — both real, bounded checks now, not a hardcoded string) |
| `apps/api` — live smoke test (curl) | ✅ `/v1/healthz` ok; `/v1/readyz` degraded as expected; unauthenticated `/v1/connectors`, `/v1/connections`, `/v1/admin/connectors`, `/v1/blueprints/sync` → `401` |
| `apps/web` — typecheck / test | ✅ 0 errors / ✅ 2/2 (unchanged — no new automated component tests, same standard as every prior phase) |
| `apps/web` — `next dev` + curl smoke test | ✅ `/channels/connections`, `/channels/connections/[fake-id]`, `/channels/capability-matrix`, `/channels/health` all `200` for both `en` and `ar` locale cookies; `dir="rtl"` confirmed |
| `apps/web` — `next build` | ⛔ pre-existing 1-D15 (Next/React version mismatch), unrelated to this pass |
| `apps/admin` — typecheck / test | ✅ 0 errors / ✅ 1/1 (unchanged) |
| `apps/admin` — `next dev` + curl smoke test | ✅ `/connectors` `200` for both locales, `dir="rtl"` confirmed |
| `apps/mobile` — `pnpm test` | ✅ 3/3 (2 files, unchanged — no mobile scope this phase per implentationplanphase.md's own task list) |
| `apps/mobile` — `pnpm typecheck` | ⛔ pre-existing 1-D16 — reproduces (confirmed, not new) |
| Root `turbo run typecheck --continue` | **13/14 packages/apps pass**; only failure is `apps/mobile` (1-D16, pre-existing, unrelated) — `packages/connectors` now passes for the first time (was the OTHER failure in every prior phase, 1-D18, now fixed) |
| Root `turbo run test --continue` | **9/9 packages/apps pass** (`packages/config` has no test script, same as every prior phase) — **281 tests passed, 9 skipped, 0 failed** across the whole monorepo |
| Scoped `eslint` on every directory this pass touched | `apps/api/src`+`test`+`prisma`, `packages/connectors/src`, `packages/shared/src`, `apps/web/app/(shell)/channels`, `apps/admin/app/(shell)/connectors`, `packages/api-client/src` — **all exit 0** (one real a11y error found and fixed — see "Bugs found") |
| Full-repo `pnpm lint` (`eslint .`) | Not completed within this report's time budget — this repo's own `docs/DEBT.md` 1-D8 documents this exact command as slow/memory-heavy across the whole monorepo; the scoped runs above cover every file this pass touched, matching the standard every prior phase's report used |
| Cross-tenant RLS / `prisma migrate` / `infra/db/rls.sql` apply | ⛔ Docker absent (0-D2/1-D1, unchanged); schema validity confirmed via `prisma generate` succeeding against every new model |
| Live Printful/Printify/Gelato/Prodigi API calls | ⛔ no real credentials exist in this sandbox for any of the four; MSW-mocked unit tests are the real, passing substitute — see `docs/CONNECTORS.md` for exactly what WAS verified live (public documentation pages, via `WebFetch`/`WebSearch`, confirmed this sandbox has that access) vs. what wasn't (authenticated API calls) |
| BullMQ queue topology against real Redis | ⛔ Docker absent — real code, confirmed to construct/boot cleanly without hanging or crashing (after the two bugs above were fixed), never exercised against an actual broker |

## Still stubbed / deferred (see `docs/DEBT.md` for the full entries)

- All four adapters are real, live-doc-confirmed code, MSW-tested — never exercised against a real
  authenticated provider account (no credentials in this sandbox). `status: 'BETA'`, not `'ACTIVE'`,
  records this honestly (3-D1, and see `docs/CONNECTORS.md`'s "Why BETA" section).
- Several exact endpoint/field shapes per adapter were confirmed to exist live but not
  independently re-verified field-by-field against a real call — flagged prominently in each
  adapter's own doc comment and in `docs/CONNECTORS.md` (3-D2).
- `POST /v1/blueprints/sync` cannot complete end-to-end here — needs a real `CONNECTED` connection
  with a real credential, which none of this sandbox's tenants have (3-D3).
- BullMQ queue topology is real code that cannot move a job through Redis here; `startWorker()`
  exists and is callable but is never invoked automatically (3-D4).
- `TokenRefreshService.runSweep()` is real, tested logic with no recurring scheduler wired yet —
  needs the same Redis-backed repeatable job the queue topology needs (3-D5).
- Printful's OAuth path needs `PRINTFUL_OAUTH_CLIENT_ID`/`SECRET`, absent here, same honest gating
  as Google/Apple SSO (3-D6).
- Per-connector rate limits used in the seed are conservative estimates, not independently
  confirmed against each provider's exact published numeric limit (3-D7).
- New web/admin Channels pages verified via `next dev` + curl only, no real browser — same ceiling
  every prior phase's web UI has hit (3-D8).
- Every new Prisma model is schema-only; no migration generated/applied; `infra/db/rls.sql`
  extended but unapplied (3-D9, same root cause as 1-D1/0-D2).
- `Credential.encryptedSecondaryBlob`'s meaning is intentionally overloaded by `kind` (OAuth refresh
  token vs. Prodigi's dual sandbox/live key) — documented, not a bug, but worth knowing (3-D10).
- Mobile has no Channels UI this phase — not a gap, implentationplanphase.md's own Phase 3 task
  list (3.1–3.13) never mentions mobile scope for connectors.
- Sync Queue and Export Packs (same Channels nav group) remain on the "coming soon" catch-all —
  correct per this phase's own scoping; both are Phase 4 (Publishing Pipeline) territory.

## Files touched (non-exhaustive — see the diff for the full list)

**Prisma/infra:** `apps/api/prisma/schema.prisma` (extended: `ConnectorVersion`, `TenantDataKey`,
`Connection`, `Credential`, `ConnectorOAuthState`, `ConnectionHealthSample`), `apps/api/prisma/connector-registry-seed.ts`
(new), `apps/api/prisma/seed.ts` (extended: registry + demo connection/health-sample seeding),
`infra/db/rls.sql` (extended).

**`packages/connectors` (near-total rebuild):** `src/{types,adapter,error-mapper,rate-limiter,http,index}.ts`,
`src/vault/{envelope,index}.ts`, `src/adapters/{printful,printify,gelato,prodigi,index}.ts`,
`test/{automation-boundary (rewritten),rate-limiter,envelope,printful.adapter,printify.adapter,gelato.adapter,prodigi.adapter}.test.ts`,
`test/contract/{printful,printify,gelato,prodigi}.contract.test.ts`, `package.json` (added `msw`).

**`packages/shared`:** `src/enums.ts` (extended), `src/schemas/{connector,connection}.ts` (new),
`src/index.ts` (extended).

**`packages/api-client`:** `src/client.ts` (`.delete()` gained an optional `body` param).

**`apps/api`:** `src/config/env.ts` (extended), `src/app.module.ts` (wired 5 new modules),
`src/health/health.controller.ts` (real Redis check), `src/rbac/subjects.ts` (extended),
`src/vault/{credential-vault.service,vault.module}.ts` (new),
`src/repositories/{connector-definition,tenant-data-key,connection,credential,connector-oauth-state,connection-health-sample}.repository.ts`
(new), `src/connectors/{connectors.service,connectors.controller,connectors.module}.ts` (new),
`src/connections/{connections.service,connections.controller,connector-oauth-callback.controller,adapter-runner.service,connections.module}.ts`
(new), `src/queue/{redis-connection,connector-queue.service,connector-queue.module}.ts` (new),
`src/token-refresh/{token-refresh.service,token-refresh.module}.ts` (new),
`src/catalog/blueprints/{blueprint-sync.service (new),blueprints.controller,blueprints.module}.ts`,
`test/{credential-vault.service,connections.service,adapter-runner.service,token-refresh.service,blueprint-sync.service,app-module-wiring}.test.ts`
(new), `test/rbac/ability.factory.test.ts` (extended), `package.json` (added `bullmq`, `ioredis`,
`@omnisell/connectors`).

**`apps/web`:** `app/(shell)/channels/connections/page.tsx` (new),
`app/(shell)/channels/connections/[id]/page.tsx` (new),
`app/(shell)/channels/capability-matrix/page.tsx` (new), `app/(shell)/channels/health/page.tsx`
(new).

**`apps/admin`:** `app/(shell)/connectors/page.tsx` (new).

**Shared packages i18n:** `packages/i18n/src/locales/{en,ar}.json` (+88 keys each, real Arabic).

**Docs:** `docs/DEBT.md` (closed 0-D8 and 1-D18; added 3-D1–3-D10), `docs/OPEN_QUESTIONS.md`
(added #23–29), `docs/CONNECTORS.md` (rewritten with real per-provider verification notes),
`docs/API.md` (Phase 3 endpoint table), `README.md` (env vars), `.env.example` (env vars), this
file.

## Next

Phase 4 — Publishing Pipeline & Export Packs: the Listing/ListingVariant state machine, the
listing composer + field-transform engine, the dry-run endpoint, the publish orchestrator that
actually calls `publish()` on the `AutomatableConnector`s this phase built (fanning out across
Printful/Printify/Gelato/Prodigi in one action — the exit criterion Phase 3 itself couldn't fully
demonstrate without something to publish), the SSE-streamed publish pipeline view (signature moment
#2), retry/DLQ/replay wired to this phase's now-real `ConnectorQueueService`, the IP/trademark
policy linter, and — for every Tier C platform (Redbubble et al.) — the Export Pack generator this
phase's registry seed already has a real row waiting for.
