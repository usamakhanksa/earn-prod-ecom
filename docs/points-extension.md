# POINTS-EXTENSION.md — Consumer Points & Wallet System

> **Document control** — Status: `LOCKED` · Rev: 1.0 · Scope: `web`, `mobile`, `api`, `admin`
>
> Relation: this is an **extension of `prompt.md`**. Every rule in `prompt.md`, `brb.md`,
> `featureslist.md`, `implentationplanphase.md`, `api-registration.md`, and `README.md` stays in
> force. On any conflict for a consumer-scoped feature, **this file wins**.

---

## 0. Ready-to-paste build prompt

Copy this block into Claude Code / Cursor / any agentic coding tool. Work phase by phase from
`implentationplanphase.md` (including **Phase 4.5**). Do not skip acceptance criteria (§16).

```
# OmniSell OS — Full System Build Prompt (Creator Commerce + Consumer Points)

You are building the entire OmniSell OS as specified in the following files, PLUS the integrated
consumer points & wallet economy in `docs/points-extension.md`:

1. Read and implement: `brb.md`, `featureslist.md`, `prompt.md`, `implentationplanphase.md`,
   `api-registration.md`, `README.md`, and `docs/points-extension.md`.
2. The consumer features to build are: a point wallet, earning points by watching videos, and
   redeeming points for discounts on products — exactly as specified in `docs/points-extension.md`
   (data model §6, domain rules §7, fraud rules §8, API §9, UI §10, configuration §12).
3. Follow the phased plan in `implentationplanphase.md`, inserting Phase 4.5 (Points Economy)
   after Phase 4. Update the README, add the §12 environment variables, and seed demo data for a
   consumer user with a wallet and a sample video (§13).

All original rules apply: no automating Tier C platforms, money as integer minor units,
tenant scoping enforced at the data layer (RLS), i18n (EN + Arabic RTL) from day one,
accessibility as a CI gate. You must output a complete, working codebase across all apps and
packages, with a final README that includes local and production setup instructions.
```

---

## 1. Purpose & scope

OmniSell OS is a multi-tenant creator-commerce platform. This extension adds a **consumer-side
loyalty economy** so the same platform serves shoppers and audience members as well as creators:

- **Wallet** — every tenant-scoped consumer owns a points wallet; balance is *derived* from
  validated `PointTransaction` rows; history, expiry, and daily limits are visible in a UI.
- **Earning** — points come from watching curated promo videos (primary P0 flow) and from
  rule-driven actions (`referral_signup`, `product_purchase_reward`, …).
- **Spending** — consumers redeem points at checkout for a currency discount; the discount is a
  first-class order line and ledger entry.

A single `User` holds both **Creator Mode** and **Consumer Mode** and switches at runtime.

### In scope
Wallet + transactions + earning rules + video earning + redemption + admin tooling + fraud review,
on web, mobile, API, and admin; i18n EN/AR; accessibility.

### Out of scope for v1
- Purchasing points directly with money (explicitly forbidden, §3.2).
- Import/export of balances from external loyalty programmes.
- Referral *invite plumbing* — C-8 is P2; the **rule engine must support** the action, the UI may trail.
- Mobile offline watch-queueing — C-15 is P2.

---

## 2. Terminology

| Term | Meaning |
|---|---|
| Consumer | A user acting in Consumer Mode: earns and spends points. |
| Creator | A user acting in Creator Mode: the existing commerce surfaces. In this extension, the creator is also the tenant's operator for `VideoContent`. |
| Wallet | The per `(tenantId, userId)` store of points. Balance is computed from `VALIDATED` transactions. |
| Points | Integer loyalty units (`BIGINT`). Never fractional, never buyable. |
| Earning rule | `PointEarningRule`: points yielded by an action + caps/cooldowns. |
| Watch session | `VideoWatch`: one server-verified viewing (STARTED → WATCHING → COMPLETED). |
| Redemption | `ProductPurchaseWithPoints` + a `SPEND` `PointTransaction` + a currency discount on the order. |

---

## 3. Non-negotiable constraints (consumer additions)

These stack on the eight constraints in `prompt.md` and are enforced in review the same way.

### 3.1 Points are integers, and only integers
- Points are stored as `BIGINT`. `packages/shared` exposes a branded `Points` type (zod
  `z.bigint()`, branded) used by API validation and client forms. No float math on points, ever.
- A `PointTransaction` is **immutable once `VALIDATED`**. Corrections are new `ADJUST` rows with a
  mandatory reason (admin); never `UPDATE` a validated amount.

### 3.2 Points ≠ money
- Points are a closed-loop loyalty currency: only ever earned (`video_watch`, referral, purchase
  reward, admin adjust) — never bought directly.
- The points → currency discount conversion rate is **per tenant** (`TenantPointSettings`, §6.2).
  A tenant may disable redemption entirely.

### 3.3 Consent & verified watch time
- No autoplay. A watch session starts only on an explicit user tap ("Watch & Earn").
- Watch time is verified server-side via periodic heartbeats (§8). Credit requires
  `verifiedSeconds >= POINTS_VIDEO_MIN_WATCH_SECONDS` (default 30) and respects the daily caps
  (§7.3).

### 3.4 Tenant-linked consumer identity
- Wallets, videos, watches, and redemptions all carry `tenantId`; every read path goes through the
  tenant-scoped repository base class; RLS is the second line of defence; a cross-tenant read test
  is mandatory.
- One `User` row backs both Creator and Consumer modes; the mode is a runtime choice, not a new user.

### 3.5 Wallet security
- **Balance is derived**: `Σ VALIDATED` transactions by sign (`EARN` +, `SPEND`/`EXPIRY` −,
  `ADJUST` ± metadata.sign). `Wallet.balance` is a *cached projection* updated under optimistic
  locking (`version`) and reconciled against the derivation before every commit.
- On mismatch the write **fails closed** and a reconciliation alert fires — no silent correction.

---

## 4. Technical additions to the base stack

| Concern | Addition | Notes |
|---|---|---|
| Video playback (mobile) | `expo-av` | Full-screen player, progress events, background-safe |
| Video playback (web) | React Player (wrapped in `packages/ui`) | Single wrapper keeps web/mobile player behaviour aligned |
| Live watch-state store | Redis (TTL keys) | Watch sessions survive API restarts; enables horizontal scaling |
| Async validation | BullMQ worker | Validates completed watches and awards points off the request path |
| Realtime balance | SSE (web); polling fallback (mobile, 30 s) | `GET /v1/wallet` |
| Fraud inputs | IP + device fingerprint + heartbeat log | Server computes the truth; client inputs are advisory only |
| Rate limiting | `@nestjs/throttler`, per-user + per-IP keys on watch endpoints | `points-watch-user`, `points-watch-ip` |

**Clock rule:** server time is authoritative. Clients send `clientClock` in heartbeats for drift
logging only — it never contributes credits.

---

## 5. Design additions (consumer sub-theme)

The base design system in `prompt.md` remains the master. Consumer screens get a **sub-theme** —
same `ink-*` palette, same 8 px grid, same motion rules (120–200 ms, `--ease`,
`prefers-reduced-motion` honoured) — with three token overrides:

```css
:root {
  --consumer-accent: var(--accent-500);   /* #F2A73B — warm action colour for consumer CTAs */
  --surface-consumer: #FBFBFA;            /* dark mode: #171B23 */
  --radius-consumer: 18px;                /* friendlier, still disciplined */
}
```

Rules:
- No new hue families beyond the base `accent-500/600`; all other tokens unchanged.
- Accessibility unchanged: AA contrast, visible focus, touch targets ≥ 44 px, explicit labels.
- Points and currency use mono numerals + `font-variant-numeric: tabular-nums`.
- RTL: wallet screens, video-player chrome, and carousels must mirror; every consumer screen gets
  a manual Arabic/RTL pass before it counts as done.

---

## 6. Data model — additions (Prisma)

All base tables remain untouched. Add these **tenant-scoped** tables, keeping the base conventions:
`id (cuid2)`, `createdAt`, `updatedAt`, indexed `tenantId`, RLS policy, and `version` on
mutation-sensitive rows for optimistic concurrency.

### 6.1 Core wallet tables (authoritative)

```prisma
model Wallet {
  id        String   @id @default(cuid2())
  tenantId  String
  userId    String
  balance   BigInt   @default(0)  // derived: sum of validated PointTransactions; cached projection
  version   Int      @default(0)  // optimistic concurrency control
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  transactions PointTransaction[]
  user         User            @relation(fields: [userId], references: [id])
  tenant       Tenant          @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, userId])
  @@index([tenantId])
}

model PointTransaction {
  id          String   @id @default(cuid2())
  walletId    String
  tenantId    String
  userId      String
  type        PointTransactionType  // EARN | SPEND | ADJUST | EXPIRY
  amount      BigInt                // positive for earn, negative for spend
  source      String                // e.g. "video_watch", "referral", "product_purchase", "admin_adjust"
  sourceId    String?               // foreign key to the source entity (e.g. VideoWatch.id)
  metadata    Json?
  status      TransactionStatus     @default(PENDING)
  validatedAt DateTime?
  expiresAt   DateTime?             // when points will expire
  createdAt   DateTime              @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@index([walletId, createdAt])
  @@index([tenantId, source, sourceId])
  @@index([status, expiresAt]) // expiry scheduler scan
}

enum PointTransactionType { EARN SPEND ADJUST EXPIRY }
enum TransactionStatus { PENDING VALIDATED REVERSED }
```

---

```prisma
model PointEarningRule {
  id              String    @id @default(cuid2())
  tenantId        String
  action          String    // "video_watch", "referral_signup", "product_purchase_reward", ...
  points          Int
  minWatchSeconds Int?      // for video_watch
  maxDailyCap     Int?      // per user per day for this action
  cooldownSeconds Int?      // enforced between two earns of the same action
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, action])
}

model VideoContent {
  id              String    @id @default(cuid2())
  tenantId        String
  title           String
  url             String    // video file URL (S3/CDN)
  durationSeconds Int
  thumbnailUrl    String?
  pointsPerView   Int?      // per-video override; falls back to tenant "video_watch" rule
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@index([tenantId, isActive])
}

model VideoWatch {
  id                String      @id @default(cuid2())
  tenantId          String
  userId            String
  videoId           String
  startTime         DateTime
  endTime           DateTime?
  watchSeconds      Int
  status            WatchStatus @default(STARTED)
  heartbeatCount    Int         @default(0)
  maxGapSeconds     Int?        // largest verified gap between heartbeats (fraud signal)
  transactionId     String?     // linked PointTransaction when points awarded
  deviceFingerprint String?
  ipAddress         String?
  createdAt         DateTime    @default(now())

  user  User         @relation(fields: [userId], references: [id])
  video VideoContent @relation(fields: [videoId], references: [id])
  tenant Tenant      @relation(fields: [tenantId], references: [id])
  @@index([tenantId, userId, videoId])
  @@index([status, createdAt])
}

enum WatchStatus { STARTED WATCHING COMPLETED FRAUD_SUSPECT CREDITED }

model ProductPurchaseWithPoints {
  id                    String         @id @default(cuid2())
  tenantId              String
  userId                String
  productId             String         // from the existing Product catalog
  orderId               String?        // linked Order once the order exists
  pointsUsed            BigInt
  discountCurrencyMinor BigInt         // discount applied in minor units (order currency)
  status                PurchaseStatus @default(PENDING)
  idempotencyKey        String?
  createdAt             DateTime       @default(now())

  user   User   @relation(fields: [userId], references: [id])
  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, idempotencyKey])
}

enum PurchaseStatus { PENDING CONFIRMED CANCELLED REFUNDED }
```

**Differences from the informal list (locked):** added `cooldownSeconds` (earning rule),
`heartbeatCount`/`maxGapSeconds` (watch), and `idempotencyKey` (redemption) — the queue/worker and
fraud flows require them. `ProductPurchaseWithPoints` never creates its own order; it attaches to
the normal order and only injects the discount line (§7.4).

### 6.2 Tenant points settings

Closes the "exchange rate configurable per tenant" invariant (§3.2):

```prisma
model TenantPointSettings {
  id                     String   @id @default(cuid2())
  tenantId               String   @unique
  currencyCode           String   @default("USD")      // ISO 4217, matches tenant billing currency
  pointsPerCurrencyMinor Int      @default(1)          // points needed for 1 minor unit of discount
  minRedeemPoints        Int      @default(100)        // floor; guards dust redemptions
  maxRedeemSharePct      Int      @default(50)         // max % of order subtotal payable by points
  autoExpireDays         Int?     @default(365)        // null = points never expire
  expiryReminderDays     Int      @default(30)         // notify this many days before expiry
  redemptionEnabled      Boolean  @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

**Redemption math — implement exactly this:**

- `discountMinor = floor(pointsUsed / pointsPerCurrencyMinor)`
- `maxDiscountMinor = floor(orderSubtotalMinor * maxRedeemSharePct / 100)`
- `discountMinimum = floor(minRedeemPoints / pointsPerCurrencyMinor)` — redemptions below this are
  rejected with `POINTS_REDEMPTION_FLOOR`.
- Final: `discount = min(discountMinor, maxDiscountMinor)`.

  *Worked example.* Rate 1 minor unit per point, order subtotal $80.00 (8,000 minor), user spends
  2,500 points → raw discount 2,500 minor ($25.00). Share cap 50% → 4,000 minor ($40.00). Discount
  $25.00. That value is persisted in `discountCurrencyMinor` at confirm time.

**Balance derivation — authoritative:**

- Available balance = `Σ VALIDATED` transactions where sign maps from `type` (`EARN` +1,
  `SPEND` −1, `EXPIRY` −1, `ADJUST` = sign stored in `metadata.sign`). `PENDING` / `REVERSED`
  rows never contribute.
- On every write: recompute `Wallet.balance` from the delta, CAS-update on `version`, and verify
  `cached == derived` before commit. A nightly job recomputes every touched wallet; a mismatch
  pages on-call.

---

## 7. Domain rules (earning engine, spending, expiry)

### 7.1 Rule resolution
Order of resolution for an action:
1. `PointEarningRule` for `(tenantId, action)` where `isActive`; missing → the action earns
   **0** and the UI presents the opportunity as unavailable (never a guessed number).
2. `VideoContent.pointsPerView` *overrides* the rule's `points` for `video_watch` when set.
3. Caps (`maxDailyCap`) and `cooldownSeconds` are enforced at award time **inside the same DB
   transaction** as the new `PointTransaction`.

### 7.2 Award flow (video — canonical)
`user taps Play → POST start → heartbeats every 5 s → complete`:
1. On complete, the server computes `verifiedSeconds` from the heartbeat log (server-received
   timestamps only, §8.1).
2. Gate 1: `verifiedSeconds >= POINTS_VIDEO_MIN_WATCH_SECONDS` (default 30).
3. Gate 2 (completion credit): `verifiedSeconds >= 60% of durationSeconds`.
4. Create `PointTransaction` (`PENDING`, `source = "video_watch"`, `sourceId = VideoWatch.id`).
5. BullMQ worker validates fraud (§8) + caps (§7.3) → `VALIDATED`, wallet projection updated,
   `VideoWatch.status = CREDITED`, transaction id backlinked.
6. Failure or suspicion → `FRAUD_SUSPECT`, no credit, admin queue entry (§10.3).

### 7.3 Daily caps + cooldowns (all actions)
- Global daily guard: no user may earn more than `POINTS_DAILY_EARNING_CAP` (default 500) in a
  tenant day across all actions — checked in the same transaction as per-action `maxDailyCap`.
- Redis counter `points:{tenantId}:{userId}:{action}:YYYY-MM-DD` is the hot path; the DB rules are
  the source of truth (Redis is a cache and may be rebuilt).
- Cooldown: a second earn of the same action within `cooldownSeconds` returns
  `POINTS_COOLDOWN` (429) with a human-readable retry time.
- Tenant-day resets at midnight in the tenant timezone (not UTC).

### 7.4 Redemption flow (checkout)
1. `POST /v1/wallet/redeem` `{ productId, pointsToUse }` → **preview only**: validates rate, floor,
   share cap, wallet balance; returns `{ discountCurrencyMinor, subtotalMinor, afterDiscountMinor }`;
   **nothing is deducted**.
2. On order confirmation, `POST /v1/wallet/redeem/confirm` `{ orderId, pointsToUse }`
   (`Idempotency-Key` required): deduct points (`SPEND`, `PENDING → VALIDATED`), insert the discount
   as an `OrderFee`-style discount line **and** an `LedgerEntry`/`LedgerLine` pair so the ledger
   always reconciles, then mark `ProductPurchaseWithPoints` `CONFIRMED`.
3. If the order is later cancelled/refunded, a matching `EARN` (`source = "redemption_refund"`)
   returns the points — points are never silently lost, never duplicated.

### 7.5 Expiry (P2 backend-ready)
- `autoExpireDays` from `TenantPointSettings` (null = never expire); the nightly scheduler writes
  `EXPIRY` rows per validated transaction whose `expiresAt` passed.
- Reminders fire `expiryReminderDays` ahead via `notifications.points_expiring` (C-9).

### 7.6 Referral / purchase reward (rule-engine only for v1)
- `referral_signup` and `product_purchase_reward` ship as rule-engine capabilities plus tests.
  Invite UI (C-8) and purchase-reward wiring trail behind feature flags.

---

## 8. Fraud & abuse prevention

### 8.1 Heartbeat protocol (mandatory)
- Cadence: client `POST .../heartbeat` every **5 seconds** with `{ timestamp, watchPosition }`.
- The server computes `verifiedSeconds` from gaps between **server-received** heartbeats (each gap
  capped at `POINTS_HEARTBEAT_INTERVAL_SECONDS`); a client `watchPosition` is only cross-checked,
  never credited.
- **Fraud signals → `FRAUD_SUSPECT`, award stops, admin queue entry:**
  - heartbeat gap > 15 s (server-side);
  - `watchPosition` moving faster than server-time accounting (acceleration detection);
  - `watchSeconds` > `durationSeconds + tolerance`;
  - ≥ 2 concurrent sessions for the same `(user, video)`;
  - the same IP across more than 3 distinct devices in one day;
  - heartbeat coverage < 60% of the claimed watch time.

### 8.2 Device fingerprint
- Mobile: install-scoped `deviceId` + OS + app version, hashed non-personally (SHA-256 of the
  components; raw identifiers are never persisted).
- Web: user agent + canvas fingerprint + IP hash.
- Stored only for fraud review; deletable via the DSAR pipeline.

### 8.3 Rate limiting
- Per-user watch sessions/day: `POINTS_MAX_WATCHES_PER_DAY` (default 10).
- Per-IP throttles on `start` and `heartbeat`; strict `429` with `Retry-After`.

### 8.4 Daily cap enforcement — §7.3. Additional invariant
> No user may earn more than the `POINTS_DAILY_EARNING_CAP` (default 500/day) across all actions —
> a global per-user guard in the award path, enforced in the same DB transaction as the credit.

### 8.5 Flag-grading & human review
- A watch in `FRAUD_SUSPECT` never self-resolves. Admin decides: **approve** → `VALIDATED` +
  credit; **reject** → `REVERSED` + mandatory note. Both actions emit audit events.

---

## 9. API endpoints (`/v1`, tenant-scoped, authenticated)

Same conventions as the base API: cursor pagination, `Idempotency-Key` on every POST, RFC 9457
`problem+json`, `X-Request-Id` echo, `429` with `Retry-After`. OpenAPI 3.1 decorators on every
handler; typed client regenerated via `pnpm openapi:gen`.

### 9.1 Wallet & points
```
GET  /v1/wallet                     → { balance, todayEarned, todayCapped, lifetimeEarned, lifetimeSpent, nextExpiry }
GET  /v1/wallet/transactions        → cursor-paginated PointTransaction list (filters: type, dateFrom, dateTo)
POST /v1/wallet/earn/video-watch    ← { videoId, watchSeconds, heartbeatLog[] }   // client-facing convenience; see note
GET  /v1/wallet/earning-rules       → active PointEarningRules for the tenant
```

> **Authoritative note — `/v1/wallet/earn/video-watch` is a thin alias over the §9.2 pipeline.**
> It looks up the latest watch for `(user, video)` in `WATCHING` state, re-verifies the heartbeat
> log, then invokes the *same* validation used by `/complete`. It exists so web/mobile players can
> award without exposing session plumbing; it must **never** credit an unverified `watchSeconds`.

### 9.2 Video watch pipeline (internal, strict)
```
POST /v1/video-watches                  ← { videoId }                    → { watchId, heartbeatsMs: 5000 }
POST /v1/video-watches/:id/heartbeat    ← { timestamp, watchPosition }    → { verifiedSeconds }
POST /v1/video-watches/:id/complete     ← { finalHeartbeat }              → { earnedPoints | null }
```

### 9.3 Redemption
```
POST /v1/wallet/redeem         ← { productId, pointsToUse }   → { discountCurrencyMinor, subtotalMinor, afterDiscountMinor }
POST /v1/wallet/redeem/confirm ← { orderId, pointsToUse }     → 201 { discountCurrencyMinor, balanceAfter }   (Idempotency-Key required)
```

### 9.4 Video content (admin / tenant operator)
```
GET /v1/videos · POST /v1/videos · GET /v1/videos/:id · PATCH /v1/videos/:id · DELETE /v1/videos/:id
```
Uploads reuse the base presigned + tus pipeline; `url` is stored, `durationSeconds` is derived
from media metadata by a **server-side probe** (never the client's claim).

### 9.5 Error catalogue (examples)
| Code | HTTP | Meaning |
|---|---|---|
| `POINTS_COOLDOWN` | 429 | Earn blocked by cooldown; includes `retryAfterSeconds` |
| `POINTS_DAILY_CAP_REACHED` | 429 | Global or per-action daily cap hit |
| `POINTS_BALANCE_INSUFFICIENT` | 409 | Not enough validated points for redemption |
| `POINTS_REDEMPTION_FLOOR` | 422 | Points below the tenant minimum redemption |
| `WATCH_FRAUD_SUSPECT` | 409 | Watch flagged; never reveals *why* to the client |
| `POINTS_RATE_MISMATCH` | 500 | Wallet projection ≠ derivation — fail closed, on-call alert |

---

## 10. Front-end changes (web · mobile · admin)

### 10.1 Mode switching
- **Web:** a top-bar toggle / org-switcher entry switches Creator ⇄ Consumer Mode for the current
  tenant; state persisted per user; correctly labelled + `aria-pressed`; RTL-safe.
- **Mobile:** a dedicated pair of bottom-tab sets (Creator ⇄ Consumer) or a mode-switcher tab;
  choice persisted in secure storage.

### 10.2 Consumer Mode — information architecture
Web (sidebar swaps to the consumer tree while Consumer Mode is active):
```
⌂ Home      — wallet pill (balance) + personalised feed: earnable videos + point-discounted products
▶ Videos    — carousel/grid of active VideoContent
⎙ Shop      — catalog browse with "Points Discount" badges (C-11)
▤ Wallet    — balance, transaction history (filter: type / date), expiry warnings
⚙ More      — earning rules, settings, "Switch to Creator Mode"
```
Mobile bottom tabs: `Home (wallet + feed) · Videos · Shop · Wallet · More`.

### 10.3 Key component specs

**Video player (web/mobile)** — full-screen, explicit play (no autoplay), progress bar, a live
points counter; the "Earn points" CTA activates once `verifiedSeconds >= minWatchSeconds`; the
heartbeat loop starts on play and stops on pause/navigate. State surface: loading / playing /
paused / buffered / error / earned / fraud-blocked.

**Wallet screen** — derived balance (tabular-nums), "today's earned vs cap" meter, transaction list
(loading skeleton, empty state, error + retry), expiry warnings, and a "no wallet yet" onboarding
state pointing at the intro video (C-1).

**Shop redemption** — product page shows "Pay up to X$ with points" when balance clears the floor; a
points slider constrained by rate, floor, and share cap; the discount renders as a preview line and
is applied at order confirm per §7.4.

**Admin — new sections**:
- **Point Rules** — CRUD on `PointEarningRule` + `TenantPointSettings` (rate, floor, share cap,
  expiry, redemption toggle).
- **Video moderation** — create/edit/archive `VideoContent`; thumbnail; points override.
- **Fraud review queue** — `FRAUD_SUSPECT` watches with signals (gaps, multi-session, device hash);
  approve/reject with mandatory note; audit-trailed.
- **Point adjustment** — manual `ADJUST` with mandatory reason code; never mutates validated rows.

### 10.4 States, i18n, a11y
- Every screen ships loading skeleton, empty state, error + retry, and success feedback.
- No hardcoded strings — `t('wallet.empty.title')` etc. in `en.json` + `ar.json`; manual RTL pass on
  all consumer screens.
- Player is keyboard-operable, pauses on blur, respects `prefers-reduced-motion`, and announces
  earned points via an `aria-live` region.

---

## 11. Implementation plan integration — Phase 4.5

Insert **Phase 4.5 — Points Economy (Weeks 18–19)** between Phase 4 (Publishing) and Phase 5
(Orders) in `implentationplanphase.md`; later phase week numbers slide by up to 2 weeks. The task
table (4.5.1–4.5.9) lives in that file. **Phase 5 and later** must then respect a confirmed
redemption: launched orders accept the discount line, and the ledger integration replays it
(§7.4).

**Phase 4.5 exit criteria:** a consumer earns points from a heartbeat-verified video watch with the
daily cap enforced; wallet shows derived balance + history; redemption preview and confirm produce a
balanced ledger pair; a fabricated heartbeat log is rejected and lands in the admin review queue;
the cross-tenant wallet read test fails as designed; EN + AR screens pass the manual RTL pass and
axe.

---

## 12. Configuration & environment

New env vars (add to `README.md` and `.env.example`):

```env
POINTS_VIDEO_MIN_WATCH_SECONDS=30      # minimum verified seconds before credit
POINTS_DAILY_EARNING_CAP=500            # global per-user daily earn guard (all actions)
POINTS_FRAUD_DETECTION_ENABLED=true     # toggle heartbeat + fingerprint validation
POINTS_HEARTBEAT_INTERVAL_SECONDS=5     # server-expected cadence
POINTS_MAX_WATCHES_PER_DAY=10           # per-user watch session limit (rate limiting)
```

These defaults apply in dev/prod unless overridden. **Tenant-level values** (rate, floor, share
cap, expiry, redemption toggle) live in `TenantPointSettings` — env vars must never carry tenant
business configuration.

---

## 13. Demo data & consumer onboarding

Seed (dev only, via `pnpm db:seed`):
- One active `video_watch` rule (e.g. 50 points, min watch 30 s, daily cap 200), one
  `VideoContent` (sample promo), and `TenantPointSettings` for the demo tenant.
- Consumer demo user `consumer@demo.test` / `Demo!2345` with a wallet pre-loaded **via valid
  `EARN` rows** (e.g. 2,000 points from `admin_adjust` + `video_watch` sources) — never a raw
  balance write.

Onboarding: after sign-up a user lands in Consumer Mode with an empty wallet, one intro video
("Watch this and earn your first 50 points"), and redemption disabled until the first earn clears.

---

## 14. Production notes

- **Video hosting:** `VideoContent.url` points at a CDN (Cloudflare Stream, AWS CloudFront). Uploads
  run through the base presigned + tus pipeline to the origin; thumbnails via sharp.
- **Horizontal scaling:** live watch sessions live in **Redis (TTL-backed)**, so `start / heartbeat /
  complete` are horizontally scalable behind the API. Heartbeats are cheap key writes; the BullMQ
  worker does the heavy validation.
- **Async validation worker:** completes are validated off-request; the worker is idempotent (a
  `VALIDATED` transaction keyed by `sourceId` prevents double awards) and has a DLQ.
- **Observability:** OTel spans on award + validation; Sentry alerting on fraud false-positive
  spikes; Pino logs omit PII by default (device *hashes* are logged, raw fingerprints never).
- **Retention / DSAR:** point transactions follow the tenant retention policy; fingerprints are
  anonymised and deletable per data-subject request.

---

## 15. Feature registry (consumer, on top of the base list)

| ID | Feature | Pri | Surface |
|---|---|---|---|
| C-1 | Consumer wallet: balance, history, expiry | P0 | W M |
| C-2 | Points from videos: full-screen player, progress, award at min watch | P0 | W M |
| C-3 | Daily caps & cooldowns per action | P0 | — |
| C-4 | Redeem points for a checkout discount | P0 | W M |
| C-5 | Video content management (admin/creator) | P1 | W A |
| C-6 | Fraud detection: heartbeat, fingerprint, anomaly flagging | P1 | — |
| C-7 | Earning-rules engine (configurable, active/inactive) | P1 | A |
| C-8 | Referral earning (invite → both get points) | P2 | W M |
| C-9 | Points expiry scheduler + reminders | P2 | — |
| C-10 | Consumer mode sidebar/tab: wallet, video feed, shop | P0 | W M |
| C-11 | Consumer browse with "Points Discount" badge | P1 | W M |
| C-12 | Order integration: discount line + ledger entry | P0 | — |
| C-13 | Wallet audit log + admin point-adjust tool | P1 | A |
| C-14 | Push notifications: new video / points expiring | P1 | M |
| C-15 | Offline support: queue a watch start, sync on reconnect | P2 | M |

(This table is mirrored verbatim as §17 of `featureslist.md`.)

---

## 16. Acceptance criteria / Definition of Done (Phase 4.5)

A consumer feature is complete only when **all** of the following hold:

- [ ] Prisma migration (tenant-scoped) + repository + RLS policy + cross-tenant negative test
- [ ] zod schemas in `packages/shared`, reused by API validation and client forms; `Points` is a
      branded `BIGINT` type
- [ ] Wallet balance derived from validated transactions; `version` CAS writes; injected-corruption
      test proves fail-closed behaviour
- [ ] Award path enforces: minimum watch duration, global daily cap, per-action cap, cooldown, and
      an idempotent double-award guard (unit + integration tests)
- [ ] Fabricated heartbeat logs → `FRAUD_SUSPECT` → admin review queue (integration test)
- [ ] Redemption preview ≤ confirm discount; ledger stays balanced; refund restores points
- [ ] Web + mobile states (loading / empty / error + retry / success); i18n `en.json` + `ar.json`;
      manual RTL pass; axe clean
- [ ] Audit event + analytics event on every mutation; docs updated;
      `docs/phases/PHASE_4_5_REPORT.md` written

---

## 17. Open decisions (locked defaults you may revisit)

| # | Question | Locked default |
|---|---|---|
| 1 | Rate direction | `pointsPerCurrencyMinor` = points per 1 minor unit (integer-friendly) |
| 2 | `pointsPerView` vs rule | Video override wins; else tenant "video_watch" rule; else 0 + hidden opportunity |
| 3 | `earn/video-watch` vs pipeline | Public alias over the canonical pipeline; unverified `watchSeconds` rejected |
| 4 | Points on refund | Restored via a new `EARN` row — never negative-balance carry |
| 5 | Global daily cap | `POINTS_DAILY_EARNING_CAP = 500`; per-action caps stack under it |
| 6 | Completion credit | Requires ≥ 60% of `durationSeconds` verified, on top of the 30 s minimum |

---

**End of spec.** When building, start from `prompt.md` + this file, follow the phases in
`implentationplanphase.md` (with Phase 4.5), and ship each feature against §16.