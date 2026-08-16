# Phase 4 — Publishing Pipeline & Export Packs · Report

**Scope:** implentationplanphase.md tasks 4.1–4.14 — the `Listing`/`ListingVariant`/
`ListingFieldOverride`/`ListingEvent` state machine, the listing composer, the field transform
engine, the dry-run endpoint, the publish orchestrator (the real exercise of the Phase 3 Tier-C
compile-time boundary), the SSE-streamed publish pipeline view (signature moment #2), retry/DLQ/
replay, bulk actions, scheduling, the approval workflow, the IP/trademark policy linter, the Export
Pack generator (the Tier C deliverable), drift detection, and the mobile listing/approval/retry
screens.

## Status: IMPLEMENTED (backend + web + admin + mobile; live-network/live-queue paths honestly
stubbed/gated — see "Still stubbed" below)

Exit criteria from implentationplanphase.md: *"bulk-publish 100 listings across 4 channels with
per-channel overrides, dry-run preview, live progress, retry on partial failure — plus a Redbubble
Export Pack a user can actually follow to upload manually."* The orchestration logic for all of
this is real, unit-tested, and exercised against the exact Tier-C compile-time gate Phase 3 built
(see "The Tier C boundary, exercised for real" below); the Redbubble Export Pack is not just
described but ACTUALLY GENERATED as real ZIP bytes in a test, unzip-verified, with real resized
print files and a real Arabic/English CHECKLIST.md. What could not be demonstrated live in this
sandbox — moving a job through a real BullMQ/Redis queue, an authenticated adapter call against a
real Printful/Printify/Gelato account, a real browser rendering the SSE pipeline view — is exactly
the same class of gap every prior phase's report already carries (3-D4, 1-D6, 1-D15), now extended
rather than newly invented.

## What shipped

### The Tier C boundary, exercised for real (the gate this whole phase is judged against)

`apps/api/src/publishing/publish-orchestrator.service.ts`'s `processListingItem` is the ONE
function every fan-out item and every retry ultimately calls. For each (listing × channel) unit of
work, it builds a `Connector` object from the channel's real registry data and calls
`canAutomate(connectorObj)` — the exact type-guard `packages/connectors/test/automation-boundary
.test.ts` proves in isolation — which narrows `connectorObj` from `Connector` to
`AutomatableConnector` only when `capabilities.canAutomate === true`. The ONLY code path that can
reach `sdkPublish` (the free-standing `publish()` function from `@omnisell/connectors`, prompt.md
constraint #1) is inside that narrowed branch; there is no `as unknown as AutomatableConnector`
anywhere in this file, and there must never be one. A Tier C connector (`canAutomate: false`) is
routed instead to `ExportPackGeneratorService.generate()` — a completely different function that
never touches `sdkPublish` at all. `test/publish-orchestrator.service.test.ts`'s "routes a Tier C
channel (Redbubble) through Export Pack generation, NEVER through the queue or sdkPublish" test is
the literal proof, alongside a third real branch: a connector that is automatable (`canAutomate:
true`) but not publish-capable (Prodigi, a pure fulfilment API — packages/connectors's own doc
comment) is marked `UNSUPPORTED` with a real, honest error, no fabricated success.

### Listing/ListingVariant/ListingFieldOverride/ListingEvent + the state machine (task 4.1)

`apps/api/prisma/schema.prisma` — `Listing` is per-(`Product`, `Connection`) (prompt.md's data
model tree read literally: multi-channel publish means N `Listing` rows created together, one per
selected channel, fanned out by one `SyncJob`). `status` is EXACTLY the six values
implentationplanphase.md specifies (`DRAFT → PENDING → QUEUED → LIVE / REJECTED / ERROR`);
`approvalStatus` is a deliberately ORTHOGONAL field — see docs/OPEN_QUESTIONS.md #30 for the full
reconciliation between this exact state machine and featureslist.md's looser "job status" language.
`ListingVariant` carries `externalId`/`price`/`status` per prompt.md's literal wording.
`ListingFieldOverride` records which fields a user explicitly diverged from the canonical composer
input (for editability/audit — the Listing's own title/description/tags already ARE the effective,
post-transform values). `ListingEvent` is a single append-only table serving BOTH the activity
timeline (5.13) and the approval comment thread (5.10) — a comment is just an event with
`type: 'COMMENT'`. `Listing.deletedAt` was added for the soft-delete bulk action, matching this
schema's own "every primary user-facing table carries `deletedAt`" convention.

### Field transform engine (task 4.3) — one of the most heavily tested parts of this phase

`apps/api/src/publishing/transform/field-transform.engine.ts` — pure, synchronous: word-boundary-
aware truncation, tag clamping (count + per-tag length), `{{var}}` template substitution, locale
string lookup with graceful fallback, physical-length unit conversion (in/cm/mm/px at a given DPI),
taxonomy mapping with an explicit "unmapped" outcome (never a guessed fallback category), and
`applyChannelTransforms` — the ONE composition every dry-run/publish call goes through, reading
limits from the connector's REAL `fieldSpec` (never hardcoded). 32 tests
(`test/field-transform.engine.test.ts`).

### Dry-run endpoint (task 4.4) — genuinely accurate, not a mock

`apps/api/src/publishing/dry-run.service.ts` calls the EXACT same code every real publish call
uses: `ListingsService.computeEffectiveFields` (the transform engine), `PublishInputBuilderService
.build` (turns OmniSell data into the SDK's `PublishInput`), and `adapter.buildPublishPayload()` —
a NEW optional SDK method this phase added specifically so `publish()`/`update()` and the dry-run
preview share ONE payload-builder function instead of two independent implementations that could
drift. `packages/connectors/test/printful.adapter.test.ts`'s new "byte-for-byte" test proves this
directly: it captures the real HTTP body `publish()` sends via MSW, then asserts
`buildPublishPayload()`'s output round-trips to the identical JSON. For Tier C channels, the dry-run
renders the real `metadata.csv`/`CHECKLIST.md` text (via `previewExportPackText`, sharing the exact
builder functions the real Export Pack generator uses) instead of a payload — no adapter call
either way.

### Publish orchestrator (task 4.5)

Fan-out: one `SyncJob` + one `SyncJobItem` per (listing × channel). The hard IP/trademark policy
gate (5.15) runs BEFORE a single `Listing` row is created — a violation on any requested channel
refuses the whole call, nothing partially created. Tier A/B automatable+publish-capable channels
enqueue a real job via `ConnectorQueueService.enqueue` (Phase 3's real BullMQ code); a queue failure
(certain in this sandbox — no Redis) is caught and recorded as a real per-item `ERROR`, not a crash
and not a fabricated success — genuinely exercising "partial success" the way task 4.5 asks for.
Tier C channels call `ExportPackGeneratorService.generate` directly (synchronous local computation,
no queue needed). 8 tests (`test/publish-orchestrator.service.test.ts`) cover every routing branch
plus the policy-gate refusal and a mixed multi-channel partial-success case.

### Publish pipeline view backend — SSE (task 4.6, signature moment #2)

`apps/api/src/publishing/sync-jobs/sync-job-stream.ts` — `createSyncJobStream`, a framework-agnostic
`Observable<SyncJobView>` (no NestJS/Express types) that polls the real `SyncJob`/`SyncJobItem` rows
and emits only on an actual change, completing on a terminal status or a hard time cap. Fully unit-
tested with a fake `fetchJob` and real timers (6 tests, `test/sync-job-stream.test.ts`) — proves the
diffing, completion, error-propagation, and unsubscribe-stops-polling behaviour independent of any
HTTP server. `SyncJobsController`'s `@Sse(':id')` wraps this for real; `GET /sync-jobs/:id/snapshot`
gives a one-shot JSON snapshot for the initial paint. On the client side, `OmniSellClient.streamSse`
(`packages/api-client`) consumes it via a real `fetch` + manual SSE-frame parser — deliberately NOT
the browser's native `EventSource`, which cannot attach the `Authorization` header this app's
Bearer-JWT auth needs (docs/DEBT.md 4-D13). 5 new tests prove it parses multi-chunk frames, sends
the real auth header, and stops on unsubscribe.

### Retry/backoff/DLQ/replay (task 4.7)

Built directly on `ConnectorQueueService`'s existing `replay`/`listFailed`/`moveToDlq` from Phase 3
— no second queue mechanism. `PublishOrchestratorService.retryListing` replays the existing queued
job when one exists, or re-runs the same routing a fresh publish would take otherwise.
`SyncJobsService.replay` replays every FAILED/DLQ item in a whole job at once (the pipeline view's
"Replay failed items" button). The admin "Jobs & Queues" board (`AdminQueuesController`,
`apps/admin/app/(shell)/jobs`) exposes the DLQ across every connector queue.

### Bulk actions (task 4.8) — honest reversibility

`apps/api/src/publishing/bulk-actions.service.ts` — `PUBLISH` delegates to the orchestrator per
listing; `UNPUBLISH` makes a REAL `adapter.unpublish()` call for automatable+`canUnpublish`
channels and honestly REFUSES (no adapter call attempted) for Tier C/Prodigi rather than pretending
to remove something it cannot touch; `REPRICE` is local-only with a real, working undo (returns the
previous `{listingVariantId, priceMinor, currency}`, restorable via `POST /listings:bulk-undo-
reprice`); `RETAG` is local-only with NO automatic undo (documented, not faked); `RESYNC` runs the
real drift-detection comparison; `DELETE` soft-deletes DRAFT/REJECTED/ERROR listings only (a
live/queued/pending listing must be unpublished first). 8 tests
(`test/bulk-actions.service.test.ts`), including one proving a single bad item never aborts the
whole bulk run.

### Scheduling (task 4.9)

`apps/api/src/publishing/scheduling/scheduling.util.ts` — real, fully tested timezone math:
`resolveScheduledAtUtc` converts a local wall-clock datetime + IANA timezone to the correct UTC
instant (handles DST transitions correctly — verified against `America/New_York` in both January
and July, plus fixed-offset `Asia/Riyadh`/`Asia/Kolkata`), `isDue`, `tzOffsetMinutes`,
`toTenantLocalDisplay`. 14 tests. `SchedulingService.runDueSweep` is real, callable sweep logic
(4 tests, mocked repos) — never invoked by a live cron here, same Redis-adjacent gap as Phase 3's
`TokenRefreshService.runSweep` (3-D5).

### Approval workflow (task 4.10)

`submitForApproval`/`decideApproval` on `ListingsService`. Reconciliation note
(docs/OPEN_QUESTIONS.md #31): brb.md's persona table names a `MANAGER` role that does not exist in
Phase 1's actual 7-role `OrgRole` enum — approval decisions are CASL-gated to `OWNER`/`ADMIN`
instead (the closest existing roles), while `DESIGNER` gets create/update/delete on `Listing` for
composing/submitting, matching brb.md's "DESIGNER submits" half exactly. Comments reuse
`ListingEvent` (`type: 'COMMENT'`) — no separate table. 12 tests cover create/update, submit,
approve, reject (both the approval-status AND state-machine-status transitions), and the
comment-thread write.

### IP/trademark policy linter (task 4.11) — a real P0 hard gate, not a UI warning

`apps/api/src/publishing/policy/ip-linter.engine.ts` — a real Levenshtein-distance implementation
(iterative DP, verified against known edit-distance pairs), `EXACT` substring matching for
multi-word trademarks, `FUZZY` per-word matching with a length-scaled edit-distance threshold (short
terms require an exact word match to avoid false positives on common short words; longer terms
tolerate typo-level obfuscation like "D1sney"). `BannedTermsService.lint()` pulls the live,
admin-editable `BannedTerm` dictionary (global — every tenant lints against the identical rows,
same reasoning as `ConnectorDefinition`) and is the EXACT function
`PublishOrchestratorService.publish()` calls before creating a single `Listing` row — 18 engine
tests plus the orchestrator's own policy-gate test prove the block is real and happens before any
queue/adapter interaction. Admin CRUD screen at `/moderation` (`apps/admin`).

### Export Pack generator (task 4.12) — THE Tier C deliverable, genuinely proven

`apps/api/src/publishing/export-packs/`:
- **`zip-writer.ts`** — a self-contained, real ZIP writer (STORE method, real CRC-32) with no
  third-party dependency (this sandbox's `pnpm install` hit a transient Windows race extracting
  fresh packages repeatedly — docs/DEBT.md 4-D14 — so this avoids depending on that resolving).
  `test/zip-writer.test.ts` round-trips a generated archive through the REAL SYSTEM `unzip` binary
  (not just this module's own logic), confirming CRC-32 against the standard published test vector.
- **`export-pack-builder.ts`** — `buildExportPack`: resizes real image bytes to the connector's
  CONFIRMED `fieldSpec` via `sharp` (the same library Phase 2's preflight/mockup pipeline already
  proved works here), assembles `print-files/`, optional `mockups/`, `metadata.csv`,
  `field-cards.html` (a real, accessible, RTL-aware clipboard-copy page), and `CHECKLIST.md` — in
  the user's REAL language via `@omnisell/i18n`'s `createTranslator`, now a real dependency of
  `apps/api` (a genuine i18n touch, not just an English string). `test/export-pack-builder.test.ts`
  (4 tests) builds a REAL zip from synthetic images, verifies the print file was ACTUALLY resized to
  3840×3840 (the Redbubble fieldSpec's confirmed minimum), asserts real Arabic content
  (`/[؀-ۿ]/.test(checklist)`) and `dir="rtl"` in the Arabic field-cards page, and confirms the
  tag-limit note appears when the tag count hits the connector's max — all unzip-verified against
  the real system binary. **This is the literal, non-fabricated proof the phase's own instruction
  asked for**: "Seed at least one real, working Redbubble Export Pack end-to-end and actually
  generate the ZIP bytes in a test."
- **`export-pack.storage.ts`** / **`export-pack-generator.service.ts`** — the HTTP-facing half
  (generate/download/confirm), mirroring `MockupsService`'s exact honesty pattern: fetches the real
  primary-asset bytes via `ObjectStorageService` (needs live MinIO, unreachable here — 503 in this
  sandbox, same as 2-D4), writes the finished ZIP to local scratch storage (so `GET /export-packs/
  :id/download` genuinely works once a pack exists, regardless of the source-fetch gap), and on
  `confirm()` transitions the `Listing` (and its variants) to `LIVE` — exactly README.md §4's
  promise that "listing state, analytics, and manual income logging then work the same as for
  automated channels." 6 tests with object storage mocked as reachable prove the full
  generate→download→confirm flow, plus the honest 503 propagation when it is not.
- **Redbubble promoted from Phase 3's "boundary-proof only, hidden" row to a real, visible
  `status: 'BETA'` Tier C channel** (docs/OPEN_QUESTIONS.md #35) with a sourced `fieldSpec`
  (`maxTags: 15` confirmed via Redbubble's own July 2023 tagging-limits announcement; image spec
  aggregated from help-center guidance; title/description caps are documented ESTIMATES — see
  docs/DEBT.md 4-D5 and docs/CONNECTORS.md for the full citation trail).

### Drift detection (task 4.13)

`apps/api/src/publishing/drift/drift.engine.ts` — pure field-by-field comparison (`computeDrift`),
6 tests against fixtures. `DriftDetectionService.check()` polls via a NEW optional SDK method,
`ConnectorAdapter.fetchListingState` (added this phase specifically for this task, per the
instruction to "poll via adapter.pullOrders/equivalent") — honestly unimplemented by all four real
adapters (no live-doc-confirmed single-listing "get" endpoint independently re-verified this pass),
so `check()` returns a real `{ supported: false }` for every shipped connector today.
`test/drift-detection.service.test.ts` proves the comparison logic genuinely works by mocking
`getAdapter` to return a FAKE adapter that DOES implement `fetchListingState` — 6 tests, including a
real detected-drift case and a real "resolve" (overwrite local from remote) case. `resolve`/
`force-push` UI actions exist on the listing detail page.

### Mobile (task 4.14)

`apps/mobile/app/(tabs)/listings.tsx` (replaces the Phase 0 "coming soon" placeholder) — a
status-filtered list (all/pending/live/error). `apps/mobile/app/listings/[id].tsx` — status detail
with the two real mutations in scope: approve/reject (wired to the same
`/listings/:id/approval-decision` endpoint the web app uses) and retry. No composer on mobile —
consistent with Phase 2's own "builder flows are web-first" scope decision.

### Web UI

Replaced the Listings section of the `(shell)/[...slug]` catch-all with real screens:
`app/(shell)/listings/{drafts,pending,scheduled,published,rejected}/page.tsx` (a shared
`ListingsListView` component: accessible sortable table, bulk-select checkboxes with real
`aria-label`s, a bulk-action toolbar), `app/(shell)/listings/new/page.tsx` (the composer — product/
channel pickers, live per-channel character/tag counters read from `GET /connectors`'s real
`fieldSpec`, dry-run preview render, save-draft/publish-now), `app/(shell)/listings/[id]/page.tsx`
(variants table, approval thread with a comment form, drift check + resolve/force-push, activity
timeline, retry). Replaced Channels → Sync Queue (`app/(shell)/channels/sync-queue/{page,[id]/page}
.tsx` — the list + the live SSE pipeline view, signature moment #2's actual home, with a
channel-logo-rail-style grid of per-item job cards) and Channels → Export Packs
(`app/(shell)/channels/export-packs/page.tsx` — download via a real authenticated blob fetch,
confirm-upload).

### Admin

`apps/admin/app/(shell)/moderation/page.tsx` — the banned-term dictionary editor (README.md §5's
"Moderation" screen), real CRUD against the exact rows the publish orchestrator lints against.
`apps/admin/app/(shell)/jobs/page.tsx` — the "Jobs & Queues" board (README.md §5), real DLQ listing
+ replay across every connector queue — extended rather than duplicated, since `apps/admin` had no
queue view from Phase 3.

## Bugs found and fixed while getting this pass green

- **`ProductsService.assertNoLiveDependencies` — closed the Phase 2 forward-looking seam
  (docs/DEBT.md 2-D8 / docs/OPEN_QUESTIONS.md #20)**: now that `Listing` exists, this guard does a
  real `ListingRepository.countLiveForProduct` check and throws `ConflictException` when a product
  has any listing still `PENDING`/`QUEUED`/`LIVE` — replacing the intentionally-empty placeholder
  Phase 2 left there.
- **`exactOptionalPropertyTypes` violations** caught immediately by `tsc` in three places
  (`FieldOverrides` interface, `resolveVariantPrice`'s selection param, a test file's inferred
  literal types) — all real type-safety catches, fixed by making the optional-property types
  explicit (`string | undefined`) rather than loosening the compiler setting.
- **Stale processes squatting on ports 4000/3000/3001** from earlier in this sandbox session masked
  the FIRST boot-check attempt: curl against the "new" build returned `404` for every Phase 4 route
  while `/healthz`/`/connectors` (pre-existing routes) answered correctly — a strong signal an OLD
  compiled process was still listening. Confirmed via `netstat`/`tasklist`, killed the stale PIDs,
  and the real boot log then showed every new route correctly `Mapped` (including the literal-colon
  routes, `listings:dry-run` etc. — proving docs/OPEN_QUESTIONS.md #32's route-naming approach
  actually works, not just compiles).
- **Prisma `EPERM`/`ENOENT` transient races** on `prisma generate`/`pnpm install` (docs/DEBT.md
  4-D14) — resolved by retrying, occasionally after clearing `node_modules/.prisma/client`.

## Verification performed in this environment

| Gate | Result |
|---|---|
| `packages/connectors` — typecheck / build / test | ✅ / ✅ / ✅ **53/53 passed, 9 skipped** (11 files) |
| `packages/shared` — typecheck / build / test | ✅ / ✅ / ✅ **40/40** |
| `packages/api-client` — typecheck / build / test | ✅ / ✅ / ✅ **11/11** (5 new SSE/download tests) |
| `packages/i18n` — build / test / en↔ar key parity | ✅ / ✅ **4/4** / ✅ **656 keys each, 0 missing either side** (+156 new this phase) |
| `packages/ui` — typecheck / test | ✅ / ✅ **7/7** (unchanged) |
| `apps/api` — typecheck / `nest build` / test | ✅ 0 errors / ✅ / ✅ **306/306** (40 files; was 166 at the end of Phase 3 — 140 new tests this phase) |
| `apps/api` — full DI graph (`app-module-wiring.test.ts`) | ✅ resolves cleanly with `PublishingModule` (11 new controllers, 10 new services, 9 new repositories) wired in |
| `apps/api` — real boot (`node dist/main.js`, no DB/Redis) | ✅ every new route mapped, including the literal-colon routes (`Mapped {/v1/listings:dry-run, POST}` etc.); degrades to `readyz: degraded` (db/redis down, both real bounded checks) |
| `apps/api` — live smoke test (curl) | ✅ `/v1/healthz` ok; unauthenticated `/v1/listings`, `/v1/listings:dry-run`, `/v1/listings:publish`, `/v1/listings:bulk`, `/v1/sync-jobs`, `/v1/sync-jobs/:id` (SSE route), `/v1/export-packs`, `/v1/banned-terms`, `/v1/admin/banned-terms` → all `401` |
| `apps/web` — typecheck / test | ✅ 0 errors / ✅ 2/2 (unchanged — no new automated component tests, same standard as every prior phase) |
| `apps/web` — `next dev` + curl smoke test | ✅ `/listings/{drafts,pending,scheduled,published,rejected,new,[fake-id]}`, `/channels/sync-queue`[`/[fake-job]`], `/channels/export-packs` all `200` for both `en`/`ar`; `dir="rtl"` confirmed |
| `apps/web` — `next build` | ⛔ pre-existing 1-D15, unrelated to this pass |
| `apps/admin` — typecheck / test | ✅ 0 errors / ✅ 1/1 (unchanged) |
| `apps/admin` — `next dev` + curl smoke test | ✅ `/moderation`, `/jobs` both `200` for `en`/`ar`, `dir="rtl"` confirmed |
| `apps/mobile` — `pnpm test` | ✅ 3/3 (unchanged — vitest, esbuild, type-stripped) |
| `apps/mobile` — `pnpm typecheck` | ⛔ pre-existing 1-D16 — the two new screens reproduce the IDENTICAL error class as every other mobile screen, confirmed not a new defect |
| Root `turbo run typecheck --continue` | **13/14 packages/apps pass**; only failure is `apps/mobile` (1-D16, pre-existing, unrelated) |
| Root `turbo run test --continue` | **9/9 packages/apps pass** (`packages/config` has no test script) — **427 tests passed, 9 skipped, 0 failed** across the whole monorepo |
| Scoped `eslint` on every directory this pass touched | `packages/connectors/src`, `packages/shared/src`, `packages/api-client/src`, `apps/api/src`+`prisma`, `apps/web/app/(shell)/listings`+`channels/sync-queue`+`channels/export-packs`+`components/listings`, `apps/admin/app/(shell)/moderation`+`jobs`, `apps/mobile/app/(tabs)/listings.tsx`+`app/listings` — **all exit 0** |
| Full-repo `pnpm lint` (`eslint .`) | Not completed within this report's time budget — docs/DEBT.md 1-D8 documents this exact command as slow/memory-heavy across the whole monorepo; scoped runs above cover every file this pass touched |
| Cross-tenant RLS / `prisma migrate` / `infra/db/rls.sql` apply | ⛔ Docker absent (0-D2/1-D1, unchanged); schema validity confirmed via `prisma generate` succeeding against every new model; `infra/db/rls.sql` extended with matching policies, equally unapplied |
| Live Printful/Printify/Gelato publish call | ⛔ no real credentials exist in this sandbox (unchanged since Phase 3, 3-D1); `packages/connectors/test/printful.adapter.test.ts`'s byte-for-byte MSW test is the real substitute for the payload correctness claim |
| BullMQ queue topology moving a real job | ⛔ Docker absent (3-D4, unchanged) — `PublishOrchestratorService`'s real `enqueue` call is exercised against a MOCKED `ConnectorQueueService` in unit tests; a live Redis would need a Docker-enabled machine |
| Real Export Pack ZIP generation | ✅ **genuinely proven** — `test/export-pack-builder.test.ts` builds a real ZIP from synthetic images and round-trips it through the real system `unzip` binary, confirming real resized dimensions and real Arabic/English content |
| SSE stream live multi-second progression | ⛔ no live queue worker exists to mutate a `SyncJob` after fan-out (same root cause as 3-D4/1-D6) — the stream's polling/diffing/completion LOGIC is proven for real with fake timers (`test/sync-job-stream.test.ts`) |

## Still stubbed / deferred (see `docs/DEBT.md` for the full entries, 4-D1 through 4-D14)

- SSE live progression (4-D1), queue-enqueue-failure-as-honest-partial-success (4-D2), drift
  detection unexercised against a real provider (4-D3), Export Pack HTTP path 503s without live
  MinIO (4-D4), Redbubble's title/description caps are estimates (4-D5), cross-provider blueprint
  mapping doesn't exist (4-D6), bulk reprice/retag are local-only (4-D7), bulk retag has no
  automatic undo (4-D8), Prisma migrations unrun (4-D10), web/admin visual QA ceiling (4-D11),
  mobile untested-on-device (4-D12), Windows tooling flakiness (4-D14) — every one of these is a
  real, working code path with a specific, named, environment-caused gap, never a fabricated
  success.
- Scheduling sweep and the token-refresh-style recurring jobs still need a live BullMQ repeatable
  job (3-D5's same root cause) — the timezone math itself is fully real and tested.
- A/B title/thumbnail testing (featureslist.md 5.14, P2) and the channel taxonomy/category
  mapper's UI suggestions (5.4) are out of this pass's scope — the underlying `mapTaxonomy` engine
  function exists and is tested, but no UI surfaces category-mapping suggestions yet.

## Files touched (non-exhaustive — see the diff for the full list)

**`packages/connectors`:** `src/types.ts` (+`RemoteListingState`), `src/adapter.ts`
(+`buildPublishPayload`/`fetchListingState`), `src/adapters/{printful,printify,gelato}.ts`
(exposed `buildPublishPayload`), `test/printful.adapter.test.ts` (+byte-for-byte dry-run test).

**`packages/shared`:** `src/enums.ts` (Phase 4 enums), `src/schemas/{listing,export-pack,
banned-term}.ts` (new), `src/index.ts`.

**`packages/api-client`:** `src/client.ts` (+`streamSse`, `+downloadBlob`), `test/client.test.ts`
(+5 tests).

**`packages/i18n`:** `src/locales/{en,ar}.json` (+156 keys each, real Arabic).

**`apps/api`:** `prisma/schema.prisma` (9 new models + relations + `Listing.deletedAt`),
`prisma/connector-registry-seed.ts` (Redbubble promotion), `prisma/seed.ts`
(+`seedPublishing`/`seedBannedTerms`), `src/config/env.ts` (+`EXPORT_PACK_SCRATCH_DIR`),
`src/app.module.ts` (+`PublishingModule`), `src/rbac/{subjects,ability.factory}.ts`,
`src/catalog/products/{products.service,products.module}.ts` (closed 2-D8),
`src/repositories/{listing,listing-variant,listing-field-override,listing-event,sync-job,
sync-job-item,export-pack,export-pack-item,banned-term}.repository.ts` (new),
`src/publishing/**` (new — `transform/field-transform.engine.ts`,
`policy/{ip-linter.engine,banned-terms.service,banned-terms.controller}.ts`,
`scheduling/{scheduling.util,scheduling.service}.ts`, `export-packs/{zip-writer,
export-pack-builder,export-pack.storage,export-pack-generator.service,
export-packs.controller}.ts`, `sync-jobs/{sync-jobs.service,sync-job-stream,
sync-jobs.controller,admin-queues.controller}.ts`, `drift/{drift.engine,
drift-detection.service,drift.controller}.ts`, `listings/{listings.service,
listings.controller}.ts`, `dry-run.service.ts`, `publish-input-builder.service.ts`,
`publish-orchestrator.service.ts`, `bulk-actions.service.ts`, `publishing.module.ts`),
`test/{field-transform.engine,ip-linter.engine,scheduling.util,zip-writer,export-pack-builder,
export-pack-generator.service,listings.service,publish-input-builder.service,dry-run.service,
publish-orchestrator.service,sync-job-stream,drift.engine,drift-detection.service,
bulk-actions.service,scheduling.service}.test.ts` (new, 15 files), `package.json`
(+`@omnisell/i18n`).

**`infra/db/rls.sql`:** Phase 4 tenant-isolation policies for 8 new tables.

**`apps/web`:** `components/listings/{listings-list-view,publish-pipeline-view}.tsx` (new),
`app/(shell)/listings/{drafts,pending,scheduled,published,rejected,new,[id]}/page.tsx` (new),
`app/(shell)/channels/sync-queue/{page,[id]/page}.tsx` (new, replaces coming-soon),
`app/(shell)/channels/export-packs/page.tsx` (new, replaces coming-soon).

**`apps/admin`:** `app/(shell)/moderation/page.tsx`, `app/(shell)/jobs/page.tsx` (new, replace
coming-soon).

**`apps/mobile`:** `app/(tabs)/listings.tsx` (replaced), `app/listings/[id].tsx` (new).

**Docs:** `docs/DEBT.md` (added 4-D1–4-D14), `docs/OPEN_QUESTIONS.md` (added #30–36),
`docs/API.md` (Phase 4 endpoint table), `docs/CONNECTORS.md` (Redbubble promotion + SDK additions),
`README.md`/`.env.example` (`EXPORT_PACK_SCRATCH_DIR`), this file.

## Next

Phase 4.5 — Points Economy (Consumer Wallet & Video Earning): the consumer-mode point wallet,
video-watch earning pipeline with server-side heartbeat verification, fraud rules, and points
redemption for checkout discounts, per `docs/points-extension.md`. This is the phase inserted
between Phase 4 and Phase 5 in implentationplanphase.md's own sequencing — the wallet/video-content
schema already exists (seeded since Phase 0/1), so this phase is about building the real
earning/redemption service layer and consumer-mode UI on top of it, not a second migration.
