# FEATURES LIST — OmniSell OS
Complete, numbered, build-ready feature enumeration.
Legend: **P0** = GA blocker · **P1** = GA target · **P2** = post-GA · `W` web · `M` mobile · `A` admin

---

## 0. INFORMATION ARCHITECTURE — SIDEBAR SPEC

### 0.1 User sidebar (web) — collapsible shell
Behaviour: 264 px expanded / 72 px icon-rail collapsed. State persisted per user. `Cmd/Ctrl + B` toggles. Keyboard-navigable tree, `aria-current="page"` on active. Full RTL mirror in Arabic. Badge counts poll every 60 s via SSE.

```
┌ ORG SWITCHER  (avatar · org name · plan chip · ⌄)
│
├ ⌂  Dashboard
│
├ ✦  Studio                                    ⌄
│   ├ Asset Library
│   ├ Collections
│   ├ AI Studio                         [credits]
│   ├ Mockup Generator
│   └ Print-File Preflight
│
├ ▤  Catalog                                   ⌄
│   ├ Products
│   ├ Blueprints & Variants
│   ├ Pricing Rules
│   └ Bundles & Kits
│
├ ⇄  Channels                            ⌄  [12]
│   ├ Connections
│   ├ Capability Matrix
│   ├ Sync Queue                          [•3]
│   ├ Export Packs
│   └ Connection Health
│
├ ↗  Listings                             ⌄
│   ├ Drafts
│   ├ Pending Approval                    [•5]
│   ├ Scheduled
│   ├ Published
│   └ Rejected / Errors                   [•2]
│
├ ⌸  Orders                               ⌄  [•8]
│   ├ All Orders
│   ├ Unfulfilled
│   ├ In Production
│   ├ Shipped
│   ├ Issues & Exceptions                 [•2]
│   └ Returns & Reprints
│
├ ⇩  Digital Products                     ⌄
│   ├ Files & Versions
│   ├ Licences & Keys
│   ├ Delivery Log
│   ├ Coupons
│   └ Entitlements
│
├ ⚒  Work & Gigs                          ⌄
│   ├ Opportunity Feed
│   ├ Applications
│   ├ Active Contracts
│   ├ Time & Deliverables
│   └ Client Invoices
│
├ ⛁  Finance                              ⌄
│   ├ Earnings Overview
│   ├ Payouts & Reconciliation
│   ├ Fees & Margin Breakdown
│   ├ Expenses
│   ├ Ledger
│   └ Tax Centre
│
├ ◫  Analytics                             ⌄
│   ├ Overview
│   ├ Channel P&L
│   ├ Product Performance
│   ├ Traffic & Conversion
│   ├ Trend & Keyword Research
│   └ Custom Reports
│
├ ⚙  Automations                           ⌄
│   ├ Rules
│   ├ Schedules
│   ├ Webhooks (outbound)
│   └ Run History
│
├ ⚑  Team                                  ⌄
│   ├ Members & Invites
│   ├ Roles & Permissions
│   └ Activity Feed
│
└─── (pinned to bottom) ───
├ ⛭  Settings                              ⌄
│   ├ Profile · Security & MFA · Sessions
│   ├ Organisation · Branding
│   ├ Billing & Plan · Invoices
│   ├ Notifications
│   ├ Localisation (lang · currency · timezone · calendar)
│   ├ API Keys & Developer
│   └ Danger Zone (export · delete)
├ ⌗  Help & Docs
└ ◉  What's New   [•]
```

### 0.2 Admin sidebar (separate `/admin` shell, distinct dark chrome + red accent)
```
├ ⌁  Command Centre            (live KPIs, incidents, queue depth)
├ ⌸  Tenants / Organisations   (search, plan, MRR, suspend, impersonate*)
├ ⚑  Users & Access            (global users, force logout, MFA reset, role grants)
├ ⇄  Connector Registry        (platforms, versions, capability flags, tier,
│                               tosUrl, apiDocsUrl, verifiedAt, enable/disable,
│                               sandbox toggle, rate-limit config, quarantine)
├ ⟳  Jobs & Queues             (BullMQ boards, DLQ, replay, drain, concurrency)
├ ⚖  Moderation                (listing review, IP/trademark flags, DMCA intake,
│                               abuse reports, banned-term dictionary)
├ ⛁  Billing & Plans           (plans, coupons, dunning, refunds, credits, tax rates)
├ ⛃  Finance Ops               (payout reconciliation, disputes, chargebacks,
│                               ledger corrections w/ mandatory reason)
├ ⌨  Support Desk              (tickets, SLA timers, macros, CSAT)
├ ⚐  Feature Flags & Config    (per-tenant targeting, % rollout, kill switches)
├ ◈  Announcements & CMS       (changelog, banners, docs, email templates)
├ ⌗  Audit Log & Compliance    (immutable log, DSAR queue, retention policy)
├ ◫  Observability             (SLOs, error budgets, connector health, traces)
├ ⛘  Data Tools                (bulk import/export, migrations, seed, backfills)
└ ⛭  System Settings           (regions, keys rotation, maintenance mode)
```
\* Impersonation requires a written reason, is time-boxed to 30 min, emits a tenant-visible audit event, and is banner-flagged in the UI.

### 0.3 Mobile navigation
- **Bottom tabs (5):** Home · Listings · Orders · Studio · More
- **"More" drawer** mirrors the full web sidebar tree.
- Deep links: `omnisell://orders/{id}`, `omnisell://listing/{id}`, universal links for web parity.
- Contextual FAB per tab (Home → New Product, Studio → Camera/Upload, Orders → Scan tracking).

---

## 1. AUTH, IDENTITY & TENANCY

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 1.1 | Email + password signup, verification email, secure reset (single-use, 30 min TTL) | P0 | W M |
| 1.2 | OAuth SSO: Google, Apple | P0 | W M |
| 1.3 | Magic-link login | P1 | W M |
| 1.4 | TOTP MFA + 10 recovery codes | P0 | W M |
| 1.5 | WebAuthn passkeys | P1 | W M |
| 1.6 | Biometric app unlock (Face/Touch/Android Biometric) | P0 | M |
| 1.7 | Session management — list devices, revoke individually or all | P0 | W M |
| 1.8 | JWT access (15 min) + rotating refresh (30 d) with reuse detection | P0 | — |
| 1.9 | Multi-org membership; org switcher; per-org role | P0 | W M |
| 1.10 | Invite by email with role preset; pending/expired invite management | P0 | W |
| 1.11 | 7 org roles: OWNER, ADMIN, MANAGER, DESIGNER, FULFILLMENT, FINANCE, VIEWER | P0 | W A |
| 1.12 | Granular permission overrides per member (CASL ability rules) | P1 | W |
| 1.13 | SAML/OIDC enterprise SSO + SCIM provisioning | P2 | W A |
| 1.14 | Agency sub-accounts with delegated access | P2 | W |
| 1.15 | Login anomaly detection → email alert + step-up auth | P1 | — |
| 1.16 | Account deletion with 30-day grace and full data export | P0 | W |

## 2. STUDIO — ASSETS, AI & MOCKUPS

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 2.1 | Drag-drop multi-upload (PNG, JPG, SVG, PDF, AI, PSD, TIFF, WEBP) up to 200 MB | P0 | W |
| 2.2 | Chunked resumable upload (tus protocol) with progress + retry | P0 | W M |
| 2.3 | Camera capture → asset (mobile) with auto-crop | P0 | M |
| 2.4 | Asset versioning with visual diff and rollback | P1 | W |
| 2.5 | Folders, collections, tags, colour labels, starred | P0 | W M |
| 2.6 | Full-text + tag + colour search; saved filters | P0 | W |
| 2.7 | **Print-file preflight**: DPI check, dimension vs blueprint, bleed/safe area, CMYK/RGB profile, transparency, min stroke width, file-size ceiling → pass/warn/fail report | P0 | W |
| 2.8 | Auto-fix suggestions (upscale, add bleed, flatten, convert profile) | P1 | W |
| 2.9 | Mockup generator: per-blueprint templates, colourways, model/flat-lay scenes, batch render | P0 | W |
| 2.10 | Mockup export presets (marketplace square, story 9:16, Pinterest 2:3) | P1 | W |
| 2.11 | AI background removal | P1 | W M |
| 2.12 | AI upscale to print resolution | P1 | W |
| 2.13 | AI listing copy: title, description, bullet points, 13 tags, per-channel length limits | P1 | W M |
| 2.14 | AI translation of listing copy into target-market locales | P1 | W |
| 2.15 | AI SEO scoring with actionable fixes | P2 | W |
| 2.16 | Credit meter, per-tenant caps, transparent per-action cost | P1 | W M A |
| 2.17 | **IP / trademark policy linter** — banned-term dictionary + fuzzy match, blocks publish with reason | P0 | W |
| 2.18 | Brand kit: logo, fonts, palette, watermark templates | P2 | W |

## 3. CATALOG

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 3.1 | Product master record (internal SKU, decoupled from channel listings) | P0 | W |
| 3.2 | Blueprint library synced from provider catalogs (garment, size, colour, print areas) | P0 | W |
| 3.3 | Variant matrix builder with bulk enable/disable and per-variant overrides | P0 | W |
| 3.4 | Multi-placement print areas (front, back, sleeve, inner label, all-over) | P0 | W |
| 3.5 | Design→placement mapping with position/scale/rotation, saved as reusable template | P0 | W |
| 3.6 | Pricing rules: cost-plus %, fixed margin, target price, psychological rounding, per-channel multiplier, per-currency floor | P0 | W |
| 3.7 | Live margin preview: base cost + fee + shipping + tax → net + margin % | P0 | W M |
| 3.8 | Landed-cost calculator by destination zone | P1 | W |
| 3.9 | Bundles / kits (physical + digital combined) | P1 | W |
| 3.10 | Bulk edit via table view; CSV import/export of catalog | P0 | W |
| 3.11 | Duplicate product, "spin-off variant set" | P1 | W |
| 3.12 | Archive with dependency guard (blocks if live listings exist) | P0 | W |
| 3.13 | Product-level changelog | P1 | W |

## 4. CHANNELS & CONNECTOR REGISTRY

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 4.1 | Connection wizard: pick platform → auth method → credentials/OAuth → scope confirm → test call → save | P0 | W |
| 4.2 | OAuth 2.0 (auth-code + PKCE) flows with state validation and callback allowlist | P0 | W |
| 4.3 | API-key / personal-access-token flow with masked display and rotate action | P0 | W |
| 4.4 | Credential vault: envelope encryption, per-tenant DEK via KMS, never logged, never returned by API | P0 | — |
| 4.5 | Automatic token refresh with pre-expiry window + failure alert | P0 | — |
| 4.6 | **Capability matrix UI** — per connector: canPublish, canUpdate, canDelete, canSyncOrders, canFulfil, canFetchCost, canFetchEarnings, canWebhook, maxTitleLen, maxTags, imageSpec | P0 | W A |
| 4.7 | Tier badge (A/B/C) with plain-language explanation of what is and isn't automated | P0 | W |
| 4.8 | **Export Pack generator (Tier C)** — ZIP: print files at exact spec, mockups, `metadata.csv`, per-field clipboard cards, printable step checklist, upload-confirmation tracker | P0 | W |
| 4.9 | Connection health: last success, error rate, latency, rate-limit headroom, token expiry countdown | P0 | W A |
| 4.10 | Sandbox/test mode per connector | P1 | W A |
| 4.11 | Per-connector rate limiter (token bucket) + adaptive backoff + jitter + per-tenant fairness | P0 | — |
| 4.12 | Inbound webhook receivers with signature verification and idempotency keys | P0 | — |
| 4.13 | Polling fallback for connectors without webhooks (cron + cursor) | P0 | — |
| 4.14 | Connector version pinning; deprecation notices to tenants | P1 | W A |
| 4.15 | Admin quarantine tier for unverified/dead platforms (hidden from users) | P0 | A |
| 4.16 | Re-verification reminder at 180 days since `verifiedAt` | P1 | A |
| 4.17 | Disconnect with data-retention choice (keep listings as orphan records vs purge) | P0 | W |

## 5. PUBLISHING PIPELINE

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 5.1 | Listing composer: channel-aware form with live character/tag counters | P0 | W |
| 5.2 | Multi-channel publish in one action; per-channel field overrides | P0 | W |
| 5.3 | Field transform engine (truncate, template, locale, unit, taxonomy map) | P0 | — |
| 5.4 | Channel taxonomy/category mapper with suggestions | P1 | W |
| 5.5 | Dry-run validation before submit — shows exactly what each channel will receive | P0 | W |
| 5.6 | Job queue with per-listing status, streaming progress, partial-success handling | P0 | W M |
| 5.7 | Retry with exponential backoff; DLQ; one-click replay | P0 | W A |
| 5.8 | Human-readable error mapping (provider code → what to fix) | P0 | W |
| 5.9 | Scheduling with timezone awareness + calendar view | P1 | W |
| 5.10 | Approval workflow (DESIGNER submits → MANAGER approves) with comments | P1 | W M |
| 5.11 | Bulk actions: publish, unpublish, reprice, retag, delete, re-sync | P0 | W |
| 5.12 | Drift detection — channel state vs OmniSell state, with resolve/force-push | P1 | W |
| 5.13 | Listing-level activity timeline | P1 | W |
| 5.14 | A/B title/thumbnail testing where the channel permits | P2 | W |
| 5.15 | Publish-blocking policy gate (preflight fail or IP-lint fail = hard stop) | P0 | W |

## 6. ORDERS & FULFILMENT

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 6.1 | Unified order feed across all connected channels | P0 | W M |
| 6.2 | Normalised order schema (buyer, items, addresses, totals, fees, tax, currency) | P0 | — |
| 6.3 | Status machine: `NEW → CONFIRMED → IN_PRODUCTION → SHIPPED → DELIVERED → CLOSED` + `CANCELLED / REFUNDED / ON_HOLD` | P0 | — |
| 6.4 | Auto-routing rules (cheapest / fastest / by-region / by-stock provider) | P1 | W |
| 6.5 | Manual fulfilment submission to provider | P0 | W M |
| 6.6 | Tracking ingestion + carrier link + delivery ETA | P0 | W M |
| 6.7 | Exception queue: address invalid, out-of-stock, print reject, payment hold, customs | P0 | W M |
| 6.8 | Returns, refunds, reprints with cost attribution to ledger | P0 | W |
| 6.9 | Packing-slip / commercial-invoice PDF generation | P1 | W |
| 6.10 | Buyer message templates (shipping delay, thank-you, review request) | P1 | W M |
| 6.11 | SLA timers + breach alerts | P1 | W M A |
| 6.12 | Barcode/tracking scan via mobile camera | P2 | M |
| 6.13 | Offline order queue with conflict-safe sync on reconnect | P0 | M |
| 6.14 | Order search + saved views + CSV export | P0 | W |

## 7. DIGITAL PRODUCTS

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 7.1 | Secure file storage with versioning | P0 | W |
| 7.2 | Time-limited signed download URLs; IP + download-count caps | P0 | — |
| 7.3 | Licence key generation (pattern-configurable), activation limits, revoke | P1 | W |
| 7.4 | Entitlement records tied to order/customer | P0 | — |
| 7.5 | Delivery log with resend and audit | P0 | W |
| 7.6 | Coupon engine: %/fixed/BOGO, usage caps, expiry, per-channel | P1 | W |
| 7.7 | Optional PDF watermarking with buyer identifier | P2 | — |
| 7.8 | Update-push notification to past buyers on new file version | P2 | — |
| 7.9 | Course/membership mapping for Podia/Thinkific/Teachable connectors | P1 | W |
| 7.10 | Sales-page hosting with custom slug (v2) | P2 | W |

## 8. WORK & GIGS

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 8.1 | Aggregated opportunity feed (API-permitted sources + RSS/public job feeds only) | P1 | W M |
| 8.2 | Saved searches with keyword/rate/region filters + push alerts | P1 | W M |
| 8.3 | Application tracker kanban (`Saved → Applied → Interview → Won → Lost`) | P1 | W M |
| 8.4 | Proposal template library with AI-assisted tailoring | P1 | W |
| 8.5 | Contract records: rate, scope, milestones, deadlines | P1 | W |
| 8.6 | Timesheets with start/stop timer (mobile-friendly) and manual entry | P1 | W M |
| 8.7 | Deliverable submission log with client sign-off | P2 | W |
| 8.8 | Client invoice generation from time/milestones → PDF + payment link | P1 | W |
| 8.9 | Task/testing income logging for platforms without APIs (manual + CSV import) | P1 | W M |
| 8.10 | Unified income view: product income + gig income in one P&L | P1 | W M |

## 9. FINANCE

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 9.1 | Double-entry ledger; every money event is a balanced journal entry | P0 | — |
| 9.2 | Fee decomposition per order: platform commission, payment fee, print cost, shipping, FX spread, tax | P0 | W |
| 9.3 | Margin waterfall chart per SKU / per channel | P1 | W |
| 9.4 | Multi-currency with daily FX rates + realised/unrealised FX gain-loss | P0 | — |
| 9.5 | Payout ingestion and reconciliation against expected earnings; variance flags | P0 | W |
| 9.6 | Expense tracking with receipt upload + OCR | P1 | W M |
| 9.7 | P&L, cash-flow, and balance statements by period | P1 | W |
| 9.8 | **Tax Centre**: VAT/OSS summary, US sales-tax nexus summary, GCC VAT, withholding notes | P1 | W |
| 9.9 | **KSA ZATCA Phase-2 e-invoicing**: UBL 2.1 XML, cryptographic stamp, QR (TLV base64), clearance/reporting API integration, 15% VAT, bilingual invoice PDF | P1 | W |
| 9.10 | Accounting exports: CSV, QuickBooks IIF/API, Xero, Zoho Books | P1 | W |
| 9.11 | Period close / lock with adjustment entries only | P2 | W |
| 9.12 | Goal & break-even tracker | P2 | W M |

## 10. ANALYTICS & INTELLIGENCE

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 10.1 | Dashboard KPI tiles: revenue, net profit, orders, AOV, margin %, payout pending — with sparkline + period delta | P0 | W M |
| 10.2 | Channel P&L comparison table with contribution margin | P1 | W |
| 10.3 | Product performance leaderboard + dead-stock (zero-sale) report | P1 | W |
| 10.4 | Cohort / repeat-purchase analysis | P2 | W |
| 10.5 | Traffic & conversion where channels expose it | P2 | W |
| 10.6 | Trend & keyword research module with seasonality view | P2 | W |
| 10.7 | Price-elasticity suggestion engine | P2 | W |
| 10.8 | Custom report builder (dimensions × measures × filters) + schedule to email | P2 | W |
| 10.9 | Anomaly alerts (sales drop, margin collapse, refund spike) | P1 | W M |
| 10.10 | Export any view to CSV/XLSX/PDF | P0 | W |

## 11. AUTOMATIONS & DEVELOPER PLATFORM

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 11.1 | Rule engine: trigger → conditions → actions, with test-run and run history | P1 | W |
| 11.2 | Triggers: order created/shipped/refunded, listing rejected, margin below X, stock out, payout received, schedule (cron) | P1 | W |
| 11.3 | Actions: publish, unpublish, reprice, retag, notify, webhook, create task, email | P1 | W |
| 11.4 | Public REST API with OpenAPI 3.1 spec, per-tenant keys, scoped permissions | P1 | W |
| 11.5 | Outbound webhooks: HMAC-SHA256 signed, retries with backoff, delivery log, replay | P1 | W |
| 11.6 | Rate limits + usage dashboard for API consumers | P1 | W |
| 11.7 | Zapier / Make / n8n templates | P2 | — |
| 11.8 | Embeddable analytics widget | P2 | W |

## 12. NOTIFICATIONS & COLLABORATION

| ID | Feature | Pri | Surface |
|---|---|---|---|
| 12.1 | In-app notification centre with read state and filters | P0 | W M |
| 12.2 | Push notifications (FCM/APNs) with per-category opt-in | P0 | M |
| 12.3 | Transactional + digest email (daily/weekly), localised templates | P0 | — |
| 12.4 | Per-channel, per-event granular preference matrix | P1 | W M |
| 12.5 | Quiet hours + timezone respect | P1 | W M |
| 12.6 | @mentions and comment threads on products, listings, orders | P1 | W M |
| 12.7 | Internal notes with visibility scope | P1 | W |
| 12.8 | Real-time presence + live job progress via WebSocket/SSE | P1 | W |

## 13. PLATFORM QUALITY (cross-cutting)

| ID | Feature | Pri |
|---|---|---|
| 13.1 | i18n: EN, AR (full RTL), FR, DE, ES, TR, UR, ZH scaffolded; ICU plurals | P0 |
| 13.2 | RTL layout mirroring: sidebar, charts, tables, icons, drag directions | P0 |
| 13.3 | Gregorian + Hijri calendar option; locale numerals | P1 |
| 13.4 | Light / dark / system theme with persisted preference | P0 |
| 13.5 | WCAG 2.2 AA: focus rings, skip links, landmarks, live regions, `prefers-reduced-motion` | P0 |
| 13.6 | Global command palette (`Cmd+K`) — search + navigate + act | P1 |
| 13.7 | Empty states, skeleton loaders, optimistic UI, error boundaries with recovery | P0 |
| 13.8 | Onboarding: 6-step guided setup, checklist, contextual tours, sample data | P0 |
| 13.9 | In-app help centre, searchable docs, video slots | P1 |
| 13.10 | Audit log of all mutating actions (actor, IP, before/after diff) | P0 |
| 13.11 | Soft delete + restore window on all major entities | P1 |
| 13.12 | Idempotency keys on all POST endpoints | P0 |
| 13.13 | Feature flags with per-tenant targeting and kill switches | P0 |
| 13.14 | Status page + in-app degradation banners per connector | P1 |
| 13.15 | GDPR/PDPL data export + erasure workflow | P0 |

## 14. ADMIN CONSOLE

| ID | Feature | Pri |
|---|---|---|
| 14.1 | Command centre: MRR, signups, active tenants, queue depth, error rate, open incidents | P0 |
| 14.2 | Tenant detail: plan, usage vs limits, connections, health, notes, timeline | P0 |
| 14.3 | Tenant actions: suspend, restore, change plan, grant credits, extend trial, force sync | P0 |
| 14.4 | Time-boxed impersonation with mandatory reason + tenant-visible audit event | P1 |
| 14.5 | Global user search; force logout; MFA reset; email change verification | P0 |
| 14.6 | Connector registry CRUD: tier, capabilities, rate limits, docs/ToS URLs, verification metadata | P0 |
| 14.7 | Queue administration: inspect, retry, drain, DLQ replay, concurrency tuning | P0 |
| 14.8 | Moderation: review queue, IP/trademark flags, DMCA intake + takedown workflow, banned-term dictionary editor | P0 |
| 14.9 | Billing ops: plans, coupons, dunning, refunds, proration, tax rates | P0 |
| 14.10 | Finance ops: payout reconciliation, disputes, ledger corrections with mandatory reason code | P1 |
| 14.11 | Support desk: tickets, SLA, macros, CSAT, attachment handling | P1 |
| 14.12 | Feature flags: create, target, % rollout, audit | P0 |
| 14.13 | Announcements: banners, changelog, email blasts with segment targeting | P1 |
| 14.14 | Immutable audit log with export; DSAR queue | P0 |
| 14.15 | Observability: SLO board, error budgets, per-connector health, trace deep-links | P1 |
| 14.16 | Data tools: bulk import/export, backfills, seed, migration runner | P1 |
| 14.17 | Maintenance mode + read-only mode | P1 |
| 14.18 | Admin RBAC: SUPER_ADMIN, SUPPORT, MODERATOR, BILLING_OPS, AUDITOR (read-only) | P0 |

## 15. MOBILE-SPECIFIC

| ID | Feature | Pri |
|---|---|---|
| 15.1 | Native shell (Expo/React Native), shared TS API client with web | P0 |
| 15.2 | Bottom-tab nav + full drawer mirroring sidebar | P0 |
| 15.3 | Push notifications with deep links | P0 |
| 15.4 | Camera + photo-library asset capture with auto-crop | P0 |
| 15.5 | Offline read cache (orders, listings, products) + queued mutations | P0 |
| 15.6 | Biometric unlock + secure keychain token storage | P0 |
| 15.7 | Home-screen widget: today's revenue + unfulfilled count | P2 |
| 15.8 | Share-sheet extension: share an image into OmniSell as an asset | P2 |
| 15.9 | Haptics, pull-to-refresh, swipe actions, bottom sheets | P1 |
| 15.10 | Dynamic type / font scaling; RTL layout | P0 |
| 15.11 | Tablet/iPad split-view layout | P2 |
| 15.12 | OTA updates (EAS Update) for JS-layer fixes | P1 |

---

## 16. CONNECTOR SHIPPING LIST

### Tier A — full automation (GA)
Printful · Printify · Gelato · Prodigi · Etsy · Shopify · WooCommerce · Gumroad · Payhip · Sellfy · Stripe · Paddle

### Tier A/B — wave 2
BigCommerce · Podia · Thinkific · Teachable · Kajabi · FastSpring · SendOwl · e-Junkie · Squarespace · Wix · Ecwid · CustomCat · Teelaunch · Inkthreadable · AOP+ · Yoycol · Teemill · Shirtigo

### Tier B — approval-gated (enable per tenant once they hold partner credentials)
Zazzle Partner API · Spring · Spreadshirt · CafePress · Fiverr (read-limited) · Upwork · Freelancer.com · Guru · PeoplePerHour · 99designs · Prolific · Respondent · User Interviews · Maze · Userlytics · UserFeel · Clickworker · Appen · TELUS International · OneForma · Bugcrowd · HackerOne

### Tier C — Export Pack only, zero automation
Redbubble · Merch by Amazon · Society6 · TeePublic · Threadless · Design By Humans

### Tier D — quarantined pending verification
SunFrog · ViralStyle · TeeChip · Selz · GitHub Jobs · Stack Overflow Jobs · Figure Eight · Playment · Validately · Samasource · Spare5 · Hive Micro · and every domain from the source list that fails live-doc verification. **None ship to users.**

> The source spreadsheet also listed IT-services firms (Accenture, Deloitte, Infosys, TCS), social networks (Facebook, TikTok, Reddit), and security vendors (CrowdStrike, Kaspersky, Qualys) as integratable income platforms. They are not. They are removed from product scope entirely — they are enterprise service providers or unrelated software, not channels a creator earns through.

## 17. CONSUMER POINTS & WALLET SYSTEM (extension)

Consumer-side loyalty economy on top of the creator platform. Full spec: `docs/points-extension.md`.
Pri: P0 = GA blocker · P1 = GA target · P2 = post-GA. `W` web · `M` mobile · `A` admin.

| ID | Feature | Pri | Surface |
|---|---|---|---|
| C-1 | Consumer wallet: view balance, transaction history, expiry of points | P0 | W M |
| C-2 | Points earning from videos: full-screen player, progress tracking, award at minimum watch duration | P0 | W M |
| C-3 | Daily earning caps and cooldown periods per action type | P0 | — |
| C-4 | Points redemption at checkout: exchange points for a discount on products | P0 | W M |
| C-5 | Video content management (admin/creator): upload, metadata, points configuration | P1 | W A |
| C-6 | Fraud detection: heartbeat verification, IP/device fingerprint, anomaly flagging | P1 | — |
| C-7 | Earning-rules engine: configurable points per action, caps, active/inactive state | P1 | A |
| C-8 | Referral earning: invite friends to join, both get points (optional) | P2 | W M |
| C-9 | Points expiry scheduler: auto-expire after X days, send reminders | P2 | — |
| C-10 | Consumer mode sidebar/tab with wallet, video feed, and shop | P0 | W M |
| C-11 | Consumer-friendly product browse with "Points Discount" badge | P1 | W M |
| C-12 | Order integration: discount line item when points are used, ledger entry required | P0 | — |
| C-13 | Wallet audit log and admin point-adjustment tool (mandatory reason code) | P1 | A |
| C-14 | Push notifications: "New video to earn points", "Your points are expiring" | P1 | M |
| C-15 | Offline support: queue a video watch start, sync when reconnected | P2 | M |

Earning sources (rule engine): `video_watch` (P0), `product_purchase_reward` (P1 trial),
`referral_signup` (P2, engine-ready). Points are integer `BIGINT`, never buyable directly,
balance always derived from validated `PointTransaction` rows.
