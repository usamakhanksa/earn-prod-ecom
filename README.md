# OmniSell OS

Multi-tenant creator-commerce platform. One console for print-on-demand, digital products, and freelance/task income — across web, iOS, and Android. It also runs a **consumer loyalty economy**: wallets, video-watch point earning, and points redemption at checkout (see `docs/points-extension.md`).

**Docs in this repo**
| File | Purpose |
|---|---|
| `brb.md` | Business requirements brief — scope, personas, NFRs, risks, commercial model |
| `featureslist.md` | Complete numbered feature enumeration + sidebar IA (incl. consumer features §17) |
| `prompt.md` | Master build prompt — stack, design system, data model, API surface, DoD |
| `implentationplanphase.md` | Phased build plan (10 phases + Phase 4.5 Points Economy) with launch gates |
| `api-registration.md` | How to obtain API credentials for every supported platform |
| `docs/points-extension.md` | **Consumer Points & Wallet system spec** — data model, API, fraud rules, UI, acceptance criteria |

---

## 1. Quick start

**Prerequisites:** Node 20+, pnpm 9+, Docker, (optional) Expo Go on a phone.

```bash
git clone <repo> omnisell && cd omnisell
pnpm install
cp .env.example .env            # fill in the required keys below
docker compose up -d            # postgres · redis · minio · mailpit
pnpm db:migrate && pnpm db:seed # schema + demo tenant + connector registry
pnpm dev    


It looks like you're trying to set up a project that needs **pnpm** and **Docker**, but neither command is found in your PowerShell session. Let’s fix both step by step.

---

## 1. Make `pnpm` work

You’ve installed pnpm via `npm install -g pnpm`, but the global `npm` bin folder isn’t in your `PATH`. Here’s how to fix it.

### Option A – Add npm’s global bin to your PATH (recommended)

1. Find where npm installs global packages by running:
   ```powershell
   npm bin -g
   ```
   Typically it’s `C:\Users\UsamaKhan-أسامةخان\AppData\Roaming\npm`.

2. Add that folder to your user `PATH`:
   - Open **System Properties** → **Environment Variables**  
   - Under *User variables*, select `Path` → Edit → New → paste the path from step 1.  
   - OK and restart PowerShell.

3. Verify:
   ```powershell
   pnpm --version
   ```

### Option B – Use Node.js Corepack (simpler)

If your Node.js version is ≥ 16.9, you can enable pnpm without touching `PATH`:
```powershell
corepack enable pnpm
corepack prepare pnpm@latest --activate
```
After that, `pnpm` should work immediately.

### Option C – Use `npx` as a temporary workaround

You can prefix every pnpm command with `npx` until the PATH is fixed:
```powershell
npx pnpm install
npx pnpm dev
```

---

## 2. Install Docker

You need Docker to run the project’s services (Postgres, Redis, etc.).  
If you’re on Windows, the easiest way is **Docker Desktop**:

1. Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. During installation, enable WSL 2 if prompted (recommended).  
3. After installation, restart your PC and launch Docker Desktop. Wait until the whale icon says “Docker Desktop is running”.
4. Verify in PowerShell:
   ```powershell
   docker --version
   docker compose version
   ```

---

## 3. PowerShell syntax note

In PowerShell, `&&` doesn’t work like in bash. Replace:
```powershell
pnpm db:migrate && pnpm db:seed
```
with either:
```powershell
pnpm db:migrate; pnpm db:seed
```
or run them as two separate lines.

---

## Once both tools are ready, follow your project setup again:

1. `cp .env.example .env` and edit `.env` with the required keys.
2. `docker compose up -d` – starts the databases etc.
3. `pnpm install` – installs dependencies.
4. `pnpm db:migrate` then `pnpm db:seed` – sets up the database schema and seed data.
5. `pnpm dev` – starts the development server.

If you run into any more errors, share the exact message and I’ll help you further.                    # api :4000 · web :3000 · admin :3001 · expo :8081
```

Demo logins (seeded, dev only):
| Account | Email | Role |
|---|---|---|
| Creator | `owner@demo.test` | `OWNER` |
| Designer | `designer@demo.test` | `DESIGNER` |
| Finance | `finance@demo.test` | `FINANCE` |
| Platform admin | `platform-admin@demo.test` | `isPlatformAdmin: true` (log in at `/admin`, :3001) |
| Consumer | `consumer@demo.test` | `MEMBER` — Consumer Mode with a seeded wallet + sample video |

Password for all: `Demo!2345`

The admin role hierarchy described in §5 below (`SUPER_ADMIN`/`SUPPORT`/`MODERATOR`/`BILLING_OPS`/
`AUDITOR`) is the target design — what's actually implemented as of Phase 1 is a single
`User.isPlatformAdmin` boolean (see `docs/OPEN_QUESTIONS.md` #18), checked by `AdminOnlyGuard`.
There is no scoped-role admin hierarchy yet.

### Required environment variables
```env
DATABASE_URL=postgresql://omnisell:omnisell@localhost:5432/omnisell
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=            # 32+ random bytes
JWT_REFRESH_SECRET=           # 32+ random bytes, different from above
KMS_MASTER_KEY=               # 32-byte base64 — wraps per-tenant credential DEKs
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=omnisell-assets
S3_ACCESS_KEY= / S3_SECRET_KEY=       # dev defaults let the API boot + presign without a live MinIO
S3_REGION=us-east-1
UPLOAD_URL_TTL_SECONDS=900             # presigned-PUT expiry (Studio uploads, Phase 2)
ASSET_UPLOAD_SCRATCH_DIR=./.upload-scratch  # disk-backed stand-in for resumable-upload chunks — see docs/DEBT.md 2-D2
EXPORT_PACK_SCRATCH_DIR=./.export-pack-scratch  # generated Export Pack ZIPs (Phase 4 task 4.12) — real API output, not a source-upload stand-in
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
# Connector OAuth callbacks (Phase 3 task 3.3) are built from API_URL directly
# (`${API_URL}/v1/oauth/callback/:slug`) — no separate OAUTH_CALLBACK_BASE var needed.

# Google/Apple OAuth SSO (Phase 1.3) — leave blank; endpoints answer 501
# oauth_provider_not_configured until a product owner supplies real values.
# See docs/DEBT.md 1-D2.
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET= / GOOGLE_REDIRECT_URI=
APPLE_CLIENT_ID= / APPLE_TEAM_ID= / APPLE_KEY_ID= / APPLE_PRIVATE_KEY= / APPLE_REDIRECT_URI=

# Printful OAuth (Phase 3 task 3.3) — the only one of the 4 Phase 3 connectors
# with an OAuth path; leave blank to keep it unreachable, same pattern as
# Google/Apple above. See docs/DEBT.md 3-D6.
PRINTFUL_OAUTH_CLIENT_ID= / PRINTFUL_OAUTH_CLIENT_SECRET=
CONNECTOR_OAUTH_STATE_TTL_MINUTES=10       # PKCE state token lifetime (Phase 3 task 3.3)
CONNECTION_HEALTH_SAMPLE_RETENTION=50      # samples kept per connection for the health board (Phase 3 task 3.11)

# TOTP MFA + invites (Phase 1.3 / 1.6)
MFA_ISSUER=OmniSell
MFA_CHALLENGE_TTL_MINUTES=10
INVITE_TTL_DAYS=7

# Consumer points & wallet (Phase 4.5) — defaults; see docs/points-extension.md §12
POINTS_VIDEO_MIN_WATCH_SECONDS=30
POINTS_DAILY_EARNING_CAP=500
POINTS_FRAUD_DETECTION_ENABLED=true
POINTS_HEARTBEAT_INTERVAL_SECONDS=5
POINTS_MAX_WATCHES_PER_DAY=10
```
Optional (features degrade gracefully if absent): `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `ZATCA_*`, and per-connector credentials (see `api-registration.md`).

### Useful commands
```bash
pnpm dev              # all apps
pnpm dev:api          # single app
pnpm test             # unit
pnpm test:integration # Testcontainers: real postgres + redis
pnpm test:e2e         # Playwright
pnpm test:contracts   # nightly connector sandbox tests
pnpm axe              # accessibility audit
pnpm openapi:gen      # regenerate the typed API client
pnpm db:studio        # Prisma Studio
```

---

## 2. Architecture at a glance

```
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │  web (Next)  │  │ mobile (Expo)│  │ admin (Next) │
                    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                           └──── typed api-client (OpenAPI) ────┘
                                          │
                              ┌───────────▼────────────┐
                              │   API (NestJS) /v1     │
                              │  guards · CASL · zod   │
                              └───┬────────────┬───────┘
                    ┌─────────────▼──┐   ┌─────▼──────────────┐
                    │  Postgres +RLS │   │ Redis + BullMQ     │
                    └────────────────┘   └─────┬──────────────┘
                                               │  one queue per connector
                                   ┌───────────▼─────────────┐
                                   │   Connector Layer       │
                                   │  Tier A/B → real APIs   │
                                   │  Tier C  → Export Packs │
                                   │  Tier D  → quarantined  │
                                   └─────────────────────────┘
```

**The one idea that defines this product:** platforms are not interchangeable. Each connector declares machine-readable capabilities, and the UI tells the truth about what can and cannot be automated. See §4.

---

## 3. Feature guide — for users

### 3.1 Sidebar map
| Section | What it's for |
|---|---|
| **Dashboard** | Revenue, net profit, orders, margin %, pending payouts, anomalies |
| **Studio** | Upload and organise designs, run print-file preflight, generate mockups, AI copy/tags/translation |
| **Catalog** | Your internal product master: blueprints, variant matrix, print placements, pricing rules, bundles |
| **Channels** | Connect platforms, see the capability matrix, monitor connection health, generate Export Packs |
| **Listings** | Drafts, pending approval, scheduled, published, and rejected/errored listings per channel |
| **Orders** | One feed for every channel: unfulfilled, in production, shipped, exceptions, returns |
| **Digital Products** | Files and versions, licence keys, delivery log, coupons, entitlements |
| **Work & Gigs** | Opportunities, applications, contracts, timesheets, client invoices |
| **Finance** | Earnings, payout reconciliation, fee/margin breakdown, expenses, ledger, Tax Centre |
| **Analytics** | Channel P&L, product performance, trends, custom reports |
| **Automations** | Rules (`when → if → then`), schedules, outbound webhooks, run history |
| **Team** | Members, invites, roles, activity feed |
| **Settings** | Profile, security & MFA, billing, notifications, localisation, API keys |

Collapse the sidebar with `⌘/Ctrl + B`. Open the command palette with `⌘/Ctrl + K`. Switch to Arabic in Settings → Localisation; the whole interface mirrors to RTL.

### 3.2 First-run path (6 steps)
1. **Create your organisation** and set currency, timezone, and tax country.
2. **Connect a channel** — Channels → Connections → New. Start with a Tier A provider (Printful or Printify) so you can see full automation working.
3. **Upload a design** — Studio → Asset Library. Fix anything preflight flags before continuing.
4. **Build a product** — Catalog → Products → New. Pick a blueprint, map the design to print areas, generate the variant matrix, apply a pricing rule. Check the margin waterfall.
5. **Publish** — Listings → New. Select channels, review the dry-run payload per channel, publish. Watch the pipeline view.
6. **Connect finance** — Finance → Settings: add your VAT/tax profile so the Tax Centre and invoices are correct from the first sale.

### 3.3 Roles — who can do what
| Capability | OWNER | ADMIN | MANAGER | DESIGNER | FULFILLMENT | FINANCE | VIEWER |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Billing & plan | ✓ | — | — | — | — | ✓ | — |
| Invite / manage members | ✓ | ✓ | — | — | — | — | — |
| Connect / disconnect channels | ✓ | ✓ | ✓ | — | — | — | — |
| Upload & edit assets | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Create / edit products | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Approve listings | ✓ | ✓ | ✓ | — | — | — | — |
| Publish to channels | ✓ | ✓ | ✓ | — | — | — | — |
| Fulfil orders / handle returns | ✓ | ✓ | ✓ | — | ✓ | — | — |
| View earnings & ledger | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Edit pricing rules | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Reconcile payouts / tax filings | ✓ | — | — | — | — | ✓ | — |
| Manage automations & API keys | ✓ | ✓ | — | — | — | — | — |
| Read-only analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Individual permissions can be overridden per member (Team → Roles & Permissions) on Studio plans and above.

### 3.4 Mobile app
Bottom tabs: **Home · Listings · Orders · Studio · More**. "More" contains the full sidebar tree. The app works offline for reading orders/listings and queues your actions (fulfil, approve, retry) until you reconnect. Enable Face/Touch/biometric unlock in Settings → Security. Push notifications are opt-in per category with quiet hours.

---

## 4. Channel tiers — read this before connecting anything

Not every platform allows software to post on your behalf. OmniSell is explicit about it rather than pretending otherwise.

| Tier | What it means | What you get |
|---|---|---|
| **A** | Public API, self-serve credentials, writes allowed | Full automation: publish, update, order sync, fulfilment, cost and earnings pull |
| **B** | API exists but is approval-gated or read-only | Whatever the provider permits. You supply approved partner credentials; the UI greys out unavailable actions and explains why |
| **C** | No public write API; automated uploading breaks their Terms of Service | **Export Pack.** OmniSell builds a ZIP with print files at the exact required spec, mockups, a `metadata.csv`, clipboard-ready field cards, and a step-by-step checklist. You upload manually, then mark it confirmed so tracking and analytics still work |
| **D** | Dead, merged, or unverified | Hidden. Held in the admin registry until a human verifies live documentation |

**Why we don't automate Tier C:** Redbubble, Merch by Amazon, Society6, TeePublic, Threadless and Design By Humans do not offer public upload APIs. Automating their web forms is a Terms of Service violation whose penalty is termination of *your* seller account — including the storefront and sales history you've spent years building. Export Packs cut the manual work from ~25 minutes to ~3 without putting your account at risk.

The source research list this product was scoped from contained ~40% dead domains, duplicated rows, unverifiable URLs, and entries that aren't income channels at all (IT-services firms, social networks, security vendors). Every one of those is quarantined in Tier D. **A connector does not reach users without `apiDocsUrl`, `tosUrl`, and a human `verifiedBy` signature.**

---

## 5. Admin console guide (`/admin`, port 3001)

Separate application, separate auth guard, distinct dark chrome with a red accent so nobody confuses it with the tenant app.

| Area | What you do there |
|---|---|
| **Command Centre** | Live MRR, signups, active tenants, queue depth, error rate, open incidents |
| **Tenants** | Search, inspect usage vs plan limits, suspend/restore, change plan, grant AI credits, extend trial, force a sync, add internal notes |
| **Users & Access** | Global user search, force logout, reset MFA, verify email changes, grant/revoke roles |
| **Connector Registry** | The most important screen. Create/edit connectors: tier, status, auth type, capability flags, rate limits, field specs, `apiDocsUrl`, `tosUrl`, `verifiedAt`/`verifiedBy`, sandbox toggle, quarantine, per-tenant enable for gated Tier B |
| **Jobs & Queues** | BullMQ boards per connector: inspect, retry, drain, replay DLQ, tune concurrency |
| **Moderation** | Listing review queue, IP/trademark flags, DMCA intake and takedown workflow, banned-term dictionary editor |
| **Billing & Plans** | Plans, coupons, dunning, refunds, proration, tax rates |
| **Finance Ops** | Payout reconciliation board, disputes, chargebacks, ledger corrections (reason code mandatory) |
| **Support Desk** | Tickets, SLA timers, macros, CSAT |
| **Feature Flags** | Create flags, target tenants, percentage rollout, kill switches |
| **Announcements & CMS** | In-app banners, changelog, segmented email blasts |
| **Audit Log & Compliance** | Immutable action log with before/after diffs; DSAR (GDPR/PDPL) request queue |
| **Observability** | SLO board, error budgets, per-connector health, trace deep-links |
| **Data Tools** | Bulk import/export, backfills, migration runner, seeding |
| **System Settings** | Regions, key rotation, maintenance and read-only modes |

**Admin roles:** `SUPER_ADMIN` (all), `SUPPORT` (tenants, tickets, no billing/finance writes), `MODERATOR` (moderation only), `BILLING_OPS` (billing + finance ops), `AUDITOR` (read-only everywhere including audit log).

**Impersonation rules:** requires a written reason, expires after 30 minutes, shows a persistent banner in the impersonated session, and writes a tenant-visible audit event. There is no silent impersonation.

---

## 6. Developer platform

- **REST API:** `/v1`, OpenAPI 3.1 at `/v1/openapi.json`, interactive docs at `/v1/docs`.
- **Auth:** tenant API keys (`Authorization: Bearer osk_live_…`) with scoped permissions, or OAuth for third-party apps.
- **Conventions:** cursor pagination, `Idempotency-Key` on POST, RFC 9457 `problem+json` errors, `X-Request-Id` echo, `429` with `Retry-After`.
- **Webhooks out:** HMAC-SHA256 signature in `X-OmniSell-Signature`, timestamp with a 5-minute replay window, retries with exponential backoff, full delivery log with replay.
- **Events:** `order.created`, `order.shipped`, `order.refunded`, `listing.published`, `listing.rejected`, `payout.received`, `margin.below_threshold`, `connection.unhealthy`.

Regenerate the typed client after any API change: `pnpm openapi:gen`.

---

## 7. Contributing rules (short version)

1. No `any`. No `@ts-ignore` without an adjacent justification.
2. No Prisma calls in controllers — go through a tenant-scoped repository.
3. Money is integer minor units + currency code. Never a float.
4. No hardcoded user-facing strings. Add to `en.json` and `ar.json`.
5. Check every new screen in Arabic/RTL before opening the PR.
6. No code path may automate a Tier C platform. This is enforced by the type system; do not work around it.
7. A connector adapter needs a real documented API URL. No guessed endpoints.
8. Every mutation emits an audit event.

See `prompt.md` → "Per-feature Definition of Done" for the full checklist.

---

## 8. Support & compliance

- Security disclosures: `security@omnisell.example` (see `SECURITY.md`).
- Data-subject requests (GDPR / Saudi PDPL): Admin → Audit Log & Compliance → DSAR queue; SLA 30 days.
- KSA e-invoicing (ZATCA Fatoora Phase 2) is available behind the `zatca_einvoicing` flag; enable per tenant after the tax profile is complete.



You want "earn money daily" — let me kill that phrase first, because it's doing damage before we even pick an idea.

No app or website pays you daily from launch. Every legitimate path — SaaS, ads, affiliate, marketplace — has a dead zone of weeks to months where you make $0 while you build the thing and find the first people willing to pay for it. Anyone selling you "daily income" software is selling you the same lie the crypto list you showed me was built on. What's real: pick one narrow, boring problem real people already pay to solve, build it fast, sell it to actual humans one at a time, and then revenue starts landing — not daily like a paycheck, but in a real, growing trickle you can track.

Here's the idea I'd actually build if I were you, why the obvious alternatives are worse, and the complete package to build it.

The idea: ReplyRight — AI review-reply generator for local businesses

Small businesses (dentists, salons, restaurants, contractors) get Google/Yelp reviews and are legally/reputationally supposed to respond to all of them, but most owners don't know what to write and don't have time. You build a tool: paste the review + business name/tone → get 3 ready-to-post replies. Charge $12–19/month for unlimited use, 5 free per month as a trial hook.

Why this over the obvious alternatives:

"AI wrapper" tools aimed at consumers (resume writers, cover letters, chatbots) are the single most saturated category in software right now — you're competing against free ChatGPT for a customer who has no urgency to pay. Skip these.
Ad-supported content/directory sites need real SEO traffic (months, often a year+) before ad revenue is meaningful. Not fast enough to matter to you right now.
SMB tools solving one recurring five-minute annoyance beat consumer AI tools because you can cold-message the buyer directly (business owners are findable on Google Maps) instead of waiting for anonymous internet traffic to find you.

The real economics, no rounding up: to hit $50/day you need roughly $1,500/month, which at $15/mo is 100 paying customers. Cold outreach to local businesses converts at maybe 2–5% if you're decent at it. That means contacting 2,000–5,000 businesses, one at a time, over 3–6 months, before you're near that number. That's the job. The code is the easy 10%.

Now the package — the build prompt, local/production setup, and README.

Created 4 files, read a file
Created 4 files, read a file

Read them in that order: guide → prompt → setup → readme. The guide is the part most people skip and the reason most people fail — the code has never been the hard part.

One more blunt point: if you paste BUILD_PROMPT.md and get a working app, you are 10% done. The other 90% is contacting real business owners every day for months. If that's not something you're willing to actually do, this whole package won't produce a dollar — no app does that on its own.