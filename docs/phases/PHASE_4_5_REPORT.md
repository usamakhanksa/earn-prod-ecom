# Phase 4.5 — Points Economy (Consumer Wallet & Video Earning) · Report

**Scope:** implentationplanphase.md tasks 4.5.1–4.5.9 / docs/points-extension.md in full — the
`Wallet`/`PointTransaction`/`PointEarningRule`/`VideoContent`/`VideoWatch`/`TenantPointSettings`/
`ProductPurchaseWithPoints` data model, the derived-balance wallet service with CAS + fail-closed
reconciliation, the earning-rule engine (resolution order, per-action + global daily caps,
cooldowns), the video watch pipeline (start/heartbeat/complete, the two award gates, the full §8.1
fraud-signal set, an async-validation queue with a documented inline fallback), redemption
(preview/confirm/refund against a real minimal double-entry `LedgerEntry`/`LedgerLine` primitive),
the expiry scheduler, Consumer Mode on web and mobile (wallet, videos + player, shop + redemption,
a Creator⇄Consumer mode switcher), the admin surfaces (Point Rules/Settings, Video moderation,
Fraud review queue, Point adjustment), and the required test coverage.

## Status: IMPLEMENTED (backend fully real and tested; web + mobile UI real and wired; two
components run inline rather than through Redis, by design — see "Still stubbed" below)

Exit criteria from implentationplanphase.md: *"a consumer earns points from a heartbeat-verified
video watch (daily cap enforced), sees derived wallet balance + transaction history, and redeems
points for a checkout discount that lands as a proper ledger line. A fabricated heartbeat log is
rejected and appears in the admin fraud-review queue."* Every piece of that sentence is real,
callable, DB-transactional code, exercised in `apps/api/test/*.test.ts` — not asserted from reading
the code, but from real test failures observed and fixed while building it (see "Bugs found"
below). What could not be demonstrated live in this sandbox — moving a job through a real
BullMQ/Redis queue, a real device/browser rendering the new screens — is exactly the same class of
gap every prior phase's report already carries (0-D2/0-D5/3-D4/1-D15/1-D16), now extended to this
phase's own files rather than newly invented.

## What shipped

### Data model (task 4.5.1)

Phase 0 had already scaffolded `Wallet`, `PointTransaction`, `PointEarningRule`, `VideoContent`,
`VideoWatch`, `TenantPointSettings`, `ProductPurchaseWithPoints` with field lists matching
points-extension.md §6 almost exactly. This pass:

- Added `VideoWatch.lastHeartbeatAt`/`lastWatchPosition`/`fraudSignals` — required to actually run
  the §8.1 heartbeat-gap/acceleration protocol without a live Redis session store (documented in
  the schema and in docs/OPEN_QUESTIONS.md #39).
- Added a DB-level idempotent-double-award guard: `PointTransaction.@@unique([tenantId, source,
  sourceId])`, on top of the plain index Phase 0 had. Postgres treats each `NULL sourceId` as
  distinct, so `admin_adjust` rows (which have no natural `sourceId`) are unaffected; every
  `video_watch`/`redemption`/`redemption_refund` row now gets real double-insert protection at the
  DB layer, not just an application-level check-then-act race.
- Added the minimal double-entry ledger primitive prompt.md's "CONSUMER MODE" section calls
  for: `LedgerEntry`/`LedgerLine`, tenant-scoped, RLS-enabled, with the DEBIT=CREDIT invariant
  asserted in code (`LedgerService.postBalancedEntry`) before any write — see
  docs/OPEN_QUESTIONS.md #38 for the exact shape and Phase 6 hand-off.
- Closed a real gap in the Phase 0 RLS scaffold: `TenantPointSettings` had a `tenantId` column but
  was never actually `ENABLE ROW LEVEL SECURITY`'d in `infra/db/rls.sql` — fixed this pass.

### Wallet service — derived balance, CAS, fail-closed reconciliation (task 4.5.2)

`WalletService.applyValidatedDelta` is the ONLY code path allowed to touch `Wallet.balance`. Every
call re-derives the balance from scratch (`Σ VALIDATED PointTransaction.amount`, via
`PointTransactionRepository.sumValidated`) and compares it to the incrementally-computed new value
BEFORE committing the CAS write (`WalletRepository.casUpdateBalance`, using `updateMany` +
`version` so a version mismatch is a normal `{count: 0}` result, not a thrown Prisma "not found").
A mismatch throws `POINTS_RATE_MISMATCH` (500) and logs a structured `WALLET_RECONCILIATION_MISMATCH`
error — the honest stand-in for a real on-call page, since no Sentry is live in this sandbox — and
the transaction rolls back. `apps/api/test/wallet.service.test.ts` proves this with an injected
corruption (a derivation that disagrees with the cached value) and asserts the write never happens.
A real nightly-reconciliation method (`reconcileAllWallets`) exists too, callable but not
automatically scheduled — same class as `TokenRefreshService.runSweep` (3-D5).

### Earning-rule engine (task 4.5.3)

`EarningRuleService.resolvePoints` implements §7.1's exact order: missing rule → 0 (hidden
opportunity, never a guessed number); `VideoContent.pointsPerView` overrides the rule's own
`points` for `video_watch` when set; otherwise the rule's `points`. `enforceCapsAndCooldown` runs
INSIDE the same `Prisma.TransactionClient` the caller is about to insert the new `PointTransaction`
in — cooldown (`POINTS_COOLDOWN`, 429, `retryAfterSeconds`), per-action `maxDailyCap`, and the
global `POINTS_DAILY_EARNING_CAP` (stacking under the per-action cap) are all checked there, not
outside the atomic boundary. 11 tests in `earning-rule.service.test.ts` cover resolution order,
cooldown boundary conditions, per-action cap boundary, global cap tripping even with no per-action
cap, and the two caps stacking.

### Video watch pipeline + fraud detection (task 4.5.4)

`VideoWatchService.start/heartbeat/complete` implement §9.2 exactly. Every §8.1 fraud signal is
real and individually unit-tested (`apps/api/test/fraud.service.test.ts`, 11 tests, pure functions
plus the two repository-backed session signals):

- Heartbeat gap > 15s (server-received-timestamp-only — the client's own `timestamp` is logged for
  drift only, per §4, never credited).
- `watchPosition` acceleration (claimed delta exceeds the real measured gap + tolerance).
- `watchSeconds` overflow beyond `durationSeconds` + tolerance.
- Heartbeat coverage < 60% of claimed elapsed wall time.
- ≥ 2 concurrent open sessions for the same `(user, video)`.
- > 3 distinct devices from the same IP in one tenant-day.

Any signal firing marks the `VideoWatch` `FRAUD_SUSPECT` (with the specific signal codes recorded)
and the request gets a generic `WATCH_FRAUD_SUSPECT` (409) — the client never learns *why*, per
§9.5. The two award gates (`verifiedSeconds >= POINTS_VIDEO_MIN_WATCH_SECONDS` AND
`verifiedSeconds >= 60% of durationSeconds`) both must pass for ANY credit — `test/video-watch.
service.test.ts`'s 12 tests cover the happy path, both individual gate failures, the idempotent
double-complete guard, two of the six session-level fraud signals end-to-end, both per-heartbeat
signals, and the admin fraud-queue approve/reject/list flow (§8.5).

**Async validation design** (task 4.5.4's "BullMQ async validation worker, idempotent, DLQ"):
`PointsQueueService` is a real `bullmq` `Queue`/`Worker`/DLQ, the same topology pattern as Phase
3's `ConnectorQueueService`. `VideoWatchService.complete()` tries `enqueueValidation()` first; when
it throws (no reachable Redis here, the expected outcome in this sandbox), it falls back to running
the EXACT SAME validation logic (`awardIfEligible` — cap/cooldown + the new `PointTransaction` +
wallet crediting, one DB transaction) synchronously in the same request. This is a deliberate,
documented design (same honesty standard as 4-D2's publish-orchestrator queue-failure handling),
not a silent stub — see docs/DEBT.md 4.5-D2.

**Video-duration probe** (§9.4): genuinely working in this sandbox. `VideoProbeService` shells out
to a real `ffprobe` (confirmed present at `C:\ProgramData\chocolatey\bin\ffprobe.exe`) —
`apps/api/test/video-probe.service.test.ts` synthesizes a real 4-second/2-second MP4 with `ffmpeg`
and asserts `ffprobe` reports back the true duration, plus a negative case (a garbage buffer
returns a typed `{probed:false}` failure, never a fabricated number). Separately verified by hand
this pass: downloading a real public sample MP4 over the network and probing its actual duration
too — outbound fetch of an arbitrary URL genuinely works here. `VideoContentService.create()`
supports both an `uploadSessionId` (reusing Phase 2's resumable-upload scratch storage unmodified)
and an external `url` (server downloads + probes, bounded to 200MB/15s) — `durationSeconds` is
never accepted as a client value in either path.

### Redemption + the minimal ledger (task 4.5.5)

`RedemptionService` implements §6.2's worked example EXACTLY (`test/redemption.service.test.ts`,
8 tests): `discountMinor = floor(pointsUsed / pointsPerCurrencyMinor)`,
`maxDiscountMinor = floor(subtotalMinor * maxRedeemSharePct / 100)`,
`discount = min(discountMinor, maxDiscountMinor)` — all-`bigint` arithmetic, `/` already floors for
non-negative operands so there is no separate rounding step to get wrong. `preview()` never
deducts; `confirm()` (requires `Idempotency-Key`, backed by both the generic `IdempotencyService`
and a DB-level `@@unique([tenantId, idempotencyKey])` on `ProductPurchaseWithPoints`) recomputes the
math fresh inside the transaction (never trusting a stale client-supplied discount), deducts points
as a `SPEND`, and posts a REAL balanced `LedgerEntry`/`LedgerLine` pair
(`sales_discounts` DEBIT / `points_liability` CREDIT) via `LedgerService.postRedemptionDiscount` —
the balance assertion is enforced in code, proven in `test/ledger.service.test.ts` (5 tests,
including an unbalanced-lines rejection that never reaches the repository). `refund()` restores
points via a brand-new `EARN` row (`source: "redemption_refund"`, §17 locked default #4 — never a
negative-balance carry, never a mutated historical row) and posts the mirroring ledger reversal.
Since Phase 5's `Order` model doesn't exist yet, `subtotalMinor` is the product's own `priceMinor`
— documented as docs/OPEN_QUESTIONS.md #41 / docs/DEBT.md 4.5-D6, with `orderId` staying nullable
so Phase 5 can attach a real order later without a schema or math change.

### Expiry scheduler (task 4.5.6)

`ExpiryService.runExpirySweep` writes real `EXPIRY` rows (crediting through the exact same
`WalletService.applyValidatedDelta` path every other award/spend does — never a direct balance
write) for every VALIDATED `EARN` transaction whose `expiresAt` has passed, and is naturally
idempotent via the same unique constraint the double-award guard uses. `sendExpiryReminders` reuses
Phase 1's `NotificationService` (§7.5's `notifications.points_expiring` hook) rather than inventing
a second delivery path. Real, callable, DB-transactional — no recurring trigger exists (no Redis
for a BullMQ repeatable job), the same class of gap as `TokenRefreshService.runSweep` (3-D5).

### Consumer Mode — web + mobile (task 4.5.7)

**Mobile** (closes docs/DEBT.md 0-D7): `apps/mobile/app/consumer/{wallet,videos,shop}.tsx` were
Phase 0 placeholders — rewritten this pass for real data (`apps/mobile/lib/points-api.ts`'s typed
wrappers over the real endpoints), with loading/empty/error states and an onboarding empty state.
A new full-screen player (`app/consumer/video/[id].tsx`) uses `expo-av` (newly added dependency):
explicit play only, a real 5-second heartbeat loop that starts on play and stops on
pause/background (`AppState` listener), completion on natural end or a manual button, and an
`AccessibilityInfo.announceForAccessibility` call for earned points (RN's `aria-live` equivalent).
`shop.tsx` lists real products and runs a genuine preview→confirm redemption flow with a real
`Idempotency-Key` (`expo-crypto`, newly added).

**Web**: new pages under `apps/web/app/(shell)/consumer/{wallet,videos,shop}` mirror the same
flows using a native `<video controls>` element and a native range-input "slider" for the points
redemption amount, plus a real `aria-live="polite"` region for the earned-points announcement. A
Creator⇄Consumer mode switcher was added to the sidebar (`aria-pressed`, RTL-safe, persisted per
user via `localStorage` — same pattern the sidebar's own collapse state already uses) that swaps
the entire nav tree to a new `CONSUMER_NAV_GROUP` (Wallet/Videos/Shop).

### Admin — Point Rules, Video moderation, Fraud queue, Point adjustment (task 4.5.8)

Implemented as tenant-scoped web pages (`apps/web/app/(shell)/points/*`), not under the platform
`apps/admin` console — see docs/OPEN_QUESTIONS.md #37 for the reasoning (the Phase 0/1 RBAC scaffold
already anticipated this: `ability.factory.ts` granted DESIGNER write on `VideoContent` and FINANCE
write on `PointEarningRule` before this phase ever touched those files). Backend:
`PointsAdminController` — rules CRUD, settings CRUD, fraud-queue list/approve/reject (mandatory
note, both audit-trailed via `AuditLogService`), and `WalletService.adjustPoints` (mandatory reason
code from a closed `POINT_ADJUST_REASON_CODES` set, always a NEW `ADJUST` row, never touches a
validated row).

### Tests (task 4.5.9)

Six new test files, 51 new tests, all passing: `fraud.service.test.ts` (11 — every §8.1 signal
individually), `earning-rule.service.test.ts` (11 — resolution order + cap/cooldown enforcement),
`wallet.service.test.ts` (4 — CAS + fail-closed reconciliation with injected corruption),
`ledger.service.test.ts` (5 — balance assertion), `redemption.service.test.ts` (8 — the §6.2 worked
example + floor/balance/disabled rejections + refund), `video-watch.service.test.ts` (12 — the two
gates, idempotency, fraud signals, admin queue). Plus `video-probe.service.test.ts` (3 — the real
ffprobe round trip). The MANDATORY cross-tenant wallet negative test already existed from Phase 1
(`test/wallet.repository.test.ts`, 3 tests, proving `WalletRepository` always injects the caller's
`tenantId` — a tenant-A caller cannot read tenant-B's wallet by id) and was re-verified green
against the extended repository this pass.

## Bugs found and fixed while getting this pass green

- `apps/api/prisma/seed-marketplace.ts` had a genuine, pre-existing type error (`Property 'scope_
  scopeKey' composite selector can't accept a real `null` scopeKey under Prisma's generated
  types) that was blocking `apps/api`'s `tsc --noEmit` before any of this phase's own code could be
  verified — fixed with a manual find-then-update-or-create, preserving the function's own
  "idempotent, safe to re-run" contract.
- A real, observed environmental hazard: `apps/api`'s generated Prisma client (the shared, default,
  un-namespaced `node_modules/@prisma/client` output location) was intermittently overwritten with
  a completely different, smaller schema's types partway through this pass, and hit the Windows
  `EPERM` query-engine-binary race (docs/DEBT.md 4-D14) far more persistently than antivirus-lock
  contention alone explains — almost certainly a concurrent process elsewhere in this monorepo also
  running `prisma generate` against the same shared output directory. Retrying immediately before
  every typecheck/test run resolved it every time observed; see docs/DEBT.md 4.5-D7 for the
  permanent-fix recommendation (a custom generator `output` path, deliberately deferred — it would
  touch every repository file's import).
- `exactOptionalPropertyTypes: true` (this workspace's strict tsconfig setting) rejected several
  zod-inferred optional fields being passed straight into Prisma `update`/repository-input types —
  fixed by either widening the target type to `T | undefined` or building the Prisma `data` object
  conditionally (only including defined keys) rather than passing the patch object through as-is.
- `LOW_HEARTBEAT_COVERAGE` fired unexpectedly in two early gate-boundary tests because the test
  fixtures set `watchSeconds` without a consistent `heartbeatCount`/`startTime` — a genuine test-
  fixture bug (not a service bug), fixed by making the fixtures internally consistent.

## Verification performed in this environment

- `apps/api`: `tsc -p tsconfig.json --noEmit` — 0 errors. `vitest run` — **47 test files, 360
  tests, all passing** (309 pre-existing + 51 new this pass). `eslint src` — 0 errors/warnings on
  every source file this pass touched or added.
- `packages/shared`: rebuilt (`tsc -p tsconfig.json`), `vitest run` — 4 files, 40 tests passing;
  `eslint src` — 0 errors.
- `packages/i18n`: `en.json`/`ar.json` — 755 keys each, exact key-set parity verified
  programmatically (zero keys present in one but not the other); `vitest run` — 1 file, 4 tests
  passing; rebuilt.
- `apps/mobile`: `vitest run` — 2 files, 3 tests passing (pre-existing; nothing in this pass added
  a testable `lib/*.ts` helper beyond `points-api.ts`, which has no dedicated unit test yet — a real
  gap, see "Still stubbed"). `eslint` on all 5 new/changed screen files — 0 errors (the real parse-
  level gate used here, since `apps/mobile`'s `tsc` is independently broken by the pre-existing
  1-D16 defect, confirmed unrelated by reproducing the identical error pattern on untouched files).
- `apps/web`: `next dev` + `curl` — all 7 new pages (`/consumer/wallet`, `/consumer/videos`,
  `/consumer/shop`, `/points/rules`, `/points/videos`, `/points/fraud-queue`, `/points/adjust`)
  return `200` for both `en` and `ar` locale cookies; `dir="rtl"` confirmed on the Arabic response.
  `vitest run` — 1 file, 2 tests passing (pre-existing, unaffected). `eslint` on the sidebar changes
  and all 7 new page files — 0 errors after two real fixes (an invalid `aria-pressed` on
  `role="switch"`, switched to a plain toggle button; a `useEffect` dependency warning on a derived
  array, fixed with `useMemo`). `tsc --noEmit` independently fails on this app for the same
  pre-existing dual-React-copy defect class as 1-D15 (confirmed: the identical error pattern
  appears across dozens of already-existing, untouched files, not just this pass's additions) —
  `next dev` + `curl` is therefore the real gate here, matching every prior phase's own standard.
- Real `ffprobe`/`ffmpeg` round trip (video duration) and a real outbound network fetch + probe of
  a public sample video — both genuinely exercised, not mocked.

## Still stubbed / deferred (see `docs/DEBT.md` 4.5-D1 through 4.5-D12 for the full entries)

- **Async validation queue** (`PointsQueueService`) — real BullMQ code, cannot move a job through
  Redis here; `VideoWatchService.complete()`'s documented inline fallback is what actually runs in
  this sandbox (4.5-D2).
- **Expiry scheduler trigger** — real logic, nothing calls it on a schedule yet (4.5-D3).
- **Mobile/web on-device/in-browser verification** — real code, parse-checked/curl-checked only;
  no real device, emulator, or browser exists in this sandbox (4.5-D4/4.5-D5, same ceiling as
  1-D4/1-D15/1-D16/2-D12/4-D11/4-D12).
- **Per-IP rate limiting** (§8.3) — the per-user daily watch-session cap is real; no IP-keyed
  limiter exists (`@nestjs/throttler` isn't installed in this workspace) (4.5-D8).
- **Realtime wallet balance (SSE)** — poll-only, matching the exact precedent Phase 1's
  notification centre already set (4.5-D9).
- **Device fingerprint hashing** (§8.2) — stored as given by the client, not SHA-256'd server-side
  before persisting (4.5-D10).
- **SSRF hardening** on the external-video-`url` fetch path — no private-IP/allow-list guard
  (4.5-D1).
- **Migration unrun** — every schema change this pass (VideoWatch's 3 new columns, the new unique
  constraint, `LedgerEntry`/`LedgerLine`) is schema-only, same root cause as every prior phase
  (4.5-D11).
- **Mode switcher persistence** is client-local only (`localStorage`/mobile's existing More-menu
  entry point), not synced across devices (4.5-D12).

## Files touched (non-exhaustive — see the diff for the full list)

**Schema/infra:** `apps/api/prisma/schema.prisma` (VideoWatch columns, PointTransaction unique
constraint, LedgerEntry/LedgerLine), `infra/db/rls.sql` (TenantPointSettings + LedgerEntry/
LedgerLine policies), `apps/api/prisma/seed-marketplace.ts` (unrelated pre-existing type-error fix).

**Shared:** `packages/shared/src/enums.ts` (LEDGER_DIRECTIONS, LEDGER_ACCOUNT_CODES,
FRAUD_SIGNAL_CODES, POINT_ADJUST_REASON_CODES), `packages/shared/src/schemas/{points,ledger}.ts`
(new), `packages/shared/src/index.ts`.

**API:** `apps/api/src/points/*` (new module: `wallet.service.ts`, `ledger.service.ts`,
`earning-rule.service.ts`, `fraud.service.ts`, `video-watch.service.ts`, `video-content.service.ts`,
`redemption.service.ts`, `expiry.service.ts`, `points-queue.service.ts`, `points.module.ts`,
`tenant-day.util.ts`, and their controllers), `apps/api/src/studio/video-probe.service.ts` (new),
`apps/api/src/repositories/{wallet,point-transaction,point-earning-rule,tenant-point-settings,
video-content,video-watch,product-purchase-with-points,ledger}.repository.ts`,
`apps/api/src/rbac/{subjects,ability.factory}.ts`, `apps/api/src/common/filters/
rfc9457-exception.filter.ts` (Retry-After header), `apps/api/src/config/env.ts`
(`POINTS_MAX_WATCHES_PER_DAY`), `apps/api/src/app.module.ts`.

**Tests:** `apps/api/test/{fraud,ledger,earning-rule,wallet,redemption,video-watch}.service.test.ts`,
`apps/api/test/video-probe.service.test.ts` (all new).

**Mobile:** `apps/mobile/lib/points-api.ts` (new), `apps/mobile/app/consumer/{wallet,videos,
shop}.tsx` (rewritten), `apps/mobile/app/consumer/video/[id].tsx` (new), `apps/mobile/package.json`
(`expo-av`, `expo-crypto`).

**Web:** `apps/web/app/(shell)/consumer/{wallet,videos,shop}/page.tsx` (new),
`apps/web/app/(shell)/points/{rules,videos,fraud-queue,adjust}/page.tsx` (new),
`apps/web/components/sidebar/{sidebar,nav-data}.tsx` (mode switcher + new nav groups),
`apps/web/lib/consumer-mode.ts` (new).

**i18n:** `packages/i18n/src/locales/{en,ar}.json` (+105 keys each, exact parity verified).

**Docs:** `docs/DEBT.md` (0-D7 closed; 12 new entries), `docs/OPEN_QUESTIONS.md` (5 new entries),
`docs/API.md` (new Phase 4.5 section), `README.md`/`.env.example` (verified consistent, no changes
needed — all 5 `POINTS_*` vars were already documented; `env.ts` was the one missing
`POINTS_MAX_WATCHES_PER_DAY`, fixed).

## Next

**Phase 5 — Orders, Fulfilment & Digital Delivery.** `ProductPurchaseWithPoints.orderId` is already
nullable specifically so Phase 5 can attach a real order to a confirmed redemption without a schema
change; `RedemptionService.computeMath`'s `subtotalMinor` should switch from the product's own
`priceMinor` to a real order subtotal once `Order`/`OrderItem` exist (docs/OPEN_QUESTIONS.md #41).
