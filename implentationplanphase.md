# IMPLEMENTATION PLAN — PHASED
## OmniSell OS · 10 phases + Phase 4.5 (Points Economy) · ~36 weeks to GA

Assumed team: 1 tech lead, 2 backend, 2 frontend, 1 mobile, 1 designer, 0.5 QA, 0.5 PM.
A solo builder should read the week counts as ×3 and cut Phases 8–9 to post-GA.

**Rule for every phase:** nothing merges to `main` without tests, docs, i18n keys, RTL check, and axe clean. Each phase ends with a demo against its exit criteria — not a status update.

---

## PHASE 0 — Foundations
**Weeks 1–2** · Exit: `pnpm dev` boots API + web + admin + Expo against Dockerised Postgres/Redis/MinIO on a clean machine.

| # | Task |
|---|---|
| 0.1 | Turborepo + pnpm workspaces; strict tsconfig preset; ESLint/Prettier; commitlint + Husky |
| 0.2 | `docker-compose`: Postgres 16, Redis 7, MinIO, Mailpit |
| 0.3 | NestJS API skeleton: config module, Pino logger, request-ID middleware, health endpoints, RFC-9457 error filter |
| 0.4 | Prisma init, migration workflow, seed script, Testcontainers harness |
| 0.5 | Next.js web + admin shells; Tailwind preset from the design tokens; shadcn/ui installed |
| 0.6 | Expo app skeleton with Expo Router; shared `api-client` generated from OpenAPI |
| 0.7 | `packages/ui` design tokens (light + dark), typography, spacing, elevation |
| 0.8 | `packages/i18n` with `en.json` + `ar.json`, RTL direction provider, locale switcher |
| 0.9 | GitHub Actions: lint → typecheck → unit → build; branch protection |
| 0.10 | OpenTelemetry + Sentry wiring; `docs/RUNBOOK.md` stub |

**Risk:** over-engineering the monorepo. Timebox to 2 weeks; ship a walking skeleton, not a platform.

---

## PHASE 1 — Identity, Tenancy, RBAC, App Shell
**Weeks 3–5** · Exit: a user signs up, creates an org, invites a colleague with a role, and both see a working sidebar shell in EN and AR on web and mobile. Cross-tenant read test fails as designed.

| # | Task |
|---|---|
| 1.1 | User/Session/Tenant/Membership models; argon2id; email verification; password reset |
| 1.2 | JWT access + rotating refresh with reuse detection; device/session list + revoke |
| 1.3 | Google + Apple OAuth; TOTP MFA + recovery codes |
| 1.4 | CASL ability factory; 7 org roles; policy guards; **Postgres RLS policies** |
| 1.5 | Tenant-scoped repository base class; cross-tenant negative tests |
| 1.6 | Org switcher, invite flow, member management UI |
| 1.7 | **Sidebar shell**: collapsible (264/72), persisted state, `⌘B`, keyboard tree, `aria-current`, badge slots, RTL mirror |
| 1.8 | Admin shell with separate auth guard, admin roles, distinct chrome |
| 1.9 | Mobile: bottom tabs + drawer mirroring sidebar; secure-store tokens; biometric unlock |
| 1.10 | Audit-log service (append-only) wired into every mutation from here on |
| 1.11 | Feature-flag service with per-tenant targeting |
| 1.12 | Notification centre skeleton (in-app + email transport) |

**Gate:** if RLS and the cross-tenant test are not in place, do not proceed. Retrofitting tenancy later is a rewrite.

---

## PHASE 2 — Studio & Catalog
**Weeks 6–9** · Exit: user uploads a design, passes preflight, builds a product with a 24-variant matrix, applies a pricing rule, and sees a correct live margin preview. Nothing has been published anywhere yet.

| # | Task |
|---|---|
| 2.1 | Presigned + tus resumable uploads; virus scan hook; thumbnail/preview pipeline (sharp) |
| 2.2 | Asset library UI: grid/list, folders, collections, tags, colour labels, search, saved filters |
| 2.3 | Asset versioning with rollback |
| 2.4 | **Print-file preflight engine**: DPI, dimensions vs blueprint, bleed/safe area, colour profile, transparency, file size → pass/warn/fail report with per-rule explanation |
| 2.5 | Mockup generator: template registry, colourway compositing, batch render worker, export presets |
| 2.6 | Blueprint cache model + sync job (populated from Printful/Printify in Phase 3; hand-seeded now) |
| 2.7 | Product master + variant matrix builder with bulk toggles and overrides |
| 2.8 | Design→placement mapping editor (position/scale/rotate per print area), saved as template |
| 2.9 | Pricing rules engine (cost-plus, fixed margin, target price, rounding, per-channel multiplier, currency floor) |
| 2.10 | Money primitives: minor units, `Money` type, FX table, formatting with tabular numerals |
| 2.11 | Live margin preview component + **margin waterfall chart** (signature moment #1) |
| 2.12 | Catalog CSV import/export; bulk table edit; duplicate; archive with dependency guard |
| 2.13 | Mobile: camera→asset with auto-crop; asset browse; product read view |

---

## PHASE 3 — Connector Framework + First 4 Integrations
**Weeks 10–14** · Exit: a real design publishes to Printful, Printify, Gelato, and Prodigi from one action; failures are legible; credentials are encrypted and unreadable in the DB dump; capability matrix renders truthfully.

| # | Task |
|---|---|
| 3.1 | `ConnectorDefinition` / `ConnectorVersion` / capability schema; registry seeder |
| 3.2 | **Credential vault**: per-tenant DEK, KMS envelope encryption, key rotation, masked hints, no-log assertion test |
| 3.3 | OAuth 2.0 + PKCE flow, state validation, callback allowlist; API-key/PAT flow |
| 3.4 | `ConnectorAdapter` interface + base class; error mapper (`provider code → userMessage + docsHint`) |
| 3.5 | Per-connector rate limiter (token bucket), adaptive backoff, jitter, per-tenant fairness queue |
| 3.6 | BullMQ queue topology (one queue per connector), DLQ, replay, concurrency config |
| 3.7 | Adapters: **Printful**, **Printify**, **Gelato**, **Prodigi** — auth, blueprints, costs, publish, update, unpublish, orders, fulfilment |
| 3.8 | MSW unit tests per adapter + nightly sandbox contract tests |
| 3.9 | Connection wizard UI (pick → auth → scopes → test call → save) |
| 3.10 | **Capability matrix UI** (signature moment #3) with plain-language degradation tooltips |
| 3.11 | Connection health board: last success, error rate, latency, rate-limit headroom, token expiry |
| 3.12 | Admin connector registry CRUD: tier, status, capabilities, docs/ToS URLs, `verifiedAt`, quarantine, sandbox toggle |
| 3.13 | Token auto-refresh worker + expiry alerting |

**Gate:** the `AutomatableConnector` type constraint must compile-block Tier C automation before any Tier C connector row exists.

---

## PHASE 4 — Publishing Pipeline & Export Packs
**Weeks 15–18** · Exit: bulk-publish 100 listings across 4 channels with per-channel overrides, dry-run preview, live progress, retry on partial failure — plus a Redbubble Export Pack a user can actually follow to upload manually.

| # | Task |
|---|---|
| 4.1 | Listing/ListingVariant/override models; state machine (`DRAFT → PENDING → QUEUED → LIVE / REJECTED / ERROR`) |
| 4.2 | Listing composer with channel-aware validation and live counters |
| 4.3 | Field transform engine (truncate, template, locale, unit, taxonomy map) + channel taxonomy mapper |
| 4.4 | **Dry-run endpoint** rendering the exact per-channel payload |
| 4.5 | Publish orchestrator: fan-out jobs, partial success, per-item error capture |
| 4.6 | **Publish pipeline view** (signature moment #2): SSE-streamed per-channel job cards |
| 4.7 | Retry/backoff, DLQ, one-click replay from UI and admin |
| 4.8 | Bulk actions (publish, unpublish, reprice, retag, resync, delete) with progress + undo where possible |
| 4.9 | Scheduling with timezone handling + calendar view |
| 4.10 | Approval workflow (submit → review → approve/reject with comments) |
| 4.11 | **IP/trademark policy linter** + banned-term dictionary (admin-editable) as a hard publish gate |
| 4.12 | **Export Pack generator**: per-channel print-file resizing to spec, mockups, `metadata.csv`, clipboard field cards, printable checklist, ZIP, confirmation tracker |
| 4.13 | Drift detection job (channel state vs local) + resolve/force-push |
| 4.14 | Mobile: listing list, status detail, approve/reject, retry |

---

## PHASE 4.5 — Points Economy (Consumer Wallet & Video Earning)
**Weeks 18–19** — inserted between Phase 4 and Phase 5; later phase week numbers are advisory and
slide by up to 2 weeks. Exit: a consumer earns points from a heartbeat-verified video watch (daily
cap enforced), sees derived wallet balance + transaction history, and redeems points for a checkout
discount that lands as a proper ledger line. A fabricated heartbeat log is rejected and appears in
the admin fraud-review queue. Full spec: `docs/points-extension.md`.

| # | Task |
|---|---|
| 4.5.1 | Migration: `Wallet`, `PointTransaction`, `TenantPointSettings`, `PointEarningRule`, `VideoContent`, `VideoWatch`, `ProductPurchaseWithPoints` — all tenant-scoped with RLS |
| 4.5.2 | Wallet service: derived balance, transaction validation, optimistic locking (`version` CAS), reconciliation check, audit events |
| 4.5.3 | Earning-rule engine: rule resolution, per-action daily caps + cooldowns, global daily guard |
| 4.5.4 | Video watch pipeline: `start` → `heartbeat` (5 s cadence) → `complete`; fraud checks; BullMQ async validation worker (idempotent, DLQ) |
| 4.5.5 | Redemption: preview discount + confirm (`SPEND` transaction), order discount line + `LedgerEntry`/`LedgerLine` pair, refund restores points |
| 4.5.6 | Expiry scheduler job + expiry-reminder notifications (P2 backend-ready) |
| 4.5.7 | Web + mobile Consumer Mode: wallet UI, video player with points counter, shop redemption, mode switcher |
| 4.5.8 | Admin: earning-rule CRUD, video management, fraud review queue, point-adjust tool (mandatory reason code) |
| 4.5.9 | Integration tests: earning, cap enforcement, redemption → ledger balance, cross-tenant isolation, fraud rejection |

**Gate:** every balance change is traceable to a validated `PointTransaction`; no code path writes a
`Wallet.balance` that is not recomputed from its transactions. DoD lives in `docs/points-extension.md` §16.

---

## PHASE 5 — Orders, Fulfilment & Digital Delivery
**Weeks 19–22** · Exit: orders from all connected channels land in one feed within 15 min; fulfilment submits to the provider; tracking flows back; a digital product delivers via expiring signed URL with a download cap.

| # | Task |
|---|---|
| 5.1 | Normalised order schema + ingestion (webhook receivers with HMAC verification + idempotency; polling fallback with cursors) |
| 5.2 | Order status machine + exception taxonomy |
| 5.3 | Unified order feed UI: filters, saved views, virtualised table, detail drawer, CSV export |
| 5.4 | Fulfilment submission + routing rules (cheapest/fastest/region/provider) |
| 5.5 | Shipment + tracking ingestion, carrier links, ETA |
| 5.6 | Exception queue with resolution actions; SLA timers + breach alerts |
| 5.7 | Returns / refunds / reprints with cost attribution |
| 5.8 | Packing slip + commercial invoice PDF generation (bilingual) |
| 5.9 | Buyer message templates |
| 5.10 | Digital products: file versions, entitlements, signed URLs (TTL + IP + count caps), delivery log + resend |
| 5.11 | Licence key generation/activation/revoke; coupon engine |
| 5.12 | Etsy / Shopify / WooCommerce / Gumroad / Payhip / Sellfy adapters (orders + listings where applicable) |
| 5.13 | Mobile: order feed, detail, fulfil, exceptions, **offline cache + queued mutations**, push notifications with deep links |

---

## PHASE 6 — Finance, Ledger & Tax
**Weeks 23–26** · Exit: ledger balances; fee decomposition matches provider statements within ±0.5% on a 30-day sample; a ZATCA-compliant invoice XML validates and its QR scans.

| # | Task |
|---|---|
| 6.1 | Double-entry `LedgerEntry`/`LedgerLine` with a balance assertion at write time |
| 6.2 | Fee decomposition per order (commission, payment fee, print cost, shipping, FX spread, tax) |
| 6.3 | FX rate ingestion; realised/unrealised gain-loss |
| 6.4 | Earnings ingestion per connector; payout records; **reconciliation engine** with variance flags |
| 6.5 | Expenses with receipt upload + OCR |
| 6.6 | P&L / cash-flow reports by period; period lock |
| 6.7 | Tax Centre: VAT/OSS summary, GCC VAT, US sales-tax nexus summary, withholding notes |
| 6.8 | **ZATCA Phase 2**: UBL 2.1 XML builder, cryptographic stamp, TLV base64 QR, clearance/reporting API client, bilingual PDF — behind flag `zatca_einvoicing` |
| 6.9 | Accounting exports (CSV, QuickBooks, Xero, Zoho Books) |
| 6.10 | Billing: Stripe subscriptions, plans, proration, dunning, usage records, AI credit ledger |
| 6.11 | Admin finance ops: reconciliation board, disputes, ledger corrections with mandatory reason code |

**Gate:** an accountant reviews the ledger output before this phase closes. Do not self-certify finance.

---

## PHASE 7 — Analytics, AI Studio & Automations
**Weeks 27–29** · Exit: channel P&L and product performance load in <2 s on a 100k-order tenant; an automation rule fires end-to-end; AI copy respects per-channel field limits and credit caps.

| # | Task |
|---|---|
| 7.1 | Analytics read models / materialised views + nightly rollup jobs |
| 7.2 | Dashboard KPI tiles with sparklines and period deltas |
| 7.3 | Channel P&L, product leaderboard, dead-stock report, anomaly alerts |
| 7.4 | RTL-aware chart wrappers; export to CSV/XLSX/PDF |
| 7.5 | AI Studio: listing copy, tags, translation, background removal, upscale — with credit metering and per-tenant caps |
| 7.6 | AI output guardrails: length clamps per channel, banned-term filter, human-edit-before-publish requirement |
| 7.7 | Automation rule engine: triggers, conditions, actions, test-run, run history |
| 7.8 | Public REST API: tenant API keys with scopes, usage dashboard, rate limits |
| 7.9 | Outbound webhooks: HMAC signing, retries, delivery log, replay |
| 7.10 | **Command palette** `⌘K` (signature moment #4) |

---

## PHASE 8 — Work & Gigs Module
**Weeks 30–31** · Exit: a contract runs from opportunity → application → milestones → timesheet → invoice, and its income appears in the unified P&L.

| # | Task |
|---|---|
| 8.1 | Opportunity ingestion — **API-permitted sources and public RSS/job feeds only**; no scraping of authenticated pages |
| 8.2 | Saved searches + push alerts |
| 8.3 | Application kanban; proposal templates with AI tailoring |
| 8.4 | Contracts, milestones, deliverables with client sign-off |
| 8.5 | Timesheets with timer (web + mobile) |
| 8.6 | Client invoicing from time/milestones → PDF + payment link |
| 8.7 | Manual/CSV income logging for no-API task platforms |
| 8.8 | Unified income view merging product + gig income |
| 8.9 | Tier B gig adapters where credentials permit: Upwork, Freelancer.com, Prolific, Respondent |

---

## PHASE 9 — Hardening, Compliance & Launch Readiness
**Weeks 32–34** · Exit: all launch gates green.

| # | Task |
|---|---|
| 9.1 | Load test to 3× projected peak; fix p95 regressions; index audit; N+1 sweep |
| 9.2 | External penetration test; remediate all critical/high |
| 9.3 | WCAG 2.2 AA audit; keyboard-only pass on every route |
| 9.4 | Native-speaker Arabic review; full RTL sweep including charts, tables, drag directions |
| 9.5 | GDPR + PDPL: DSAR queue, export, erasure, retention policy, DPA templates, cookie/consent |
| 9.6 | Backup + restore drill; RPO/RTO documented; DR runbook rehearsed |
| 9.7 | SLO definitions + error budgets + alert routing; on-call rotation |
| 9.8 | Chaos drill: kill a connector, kill Redis, expire all tokens — verify graceful degradation banners |
| 9.9 | App Store / Play Store submission: privacy manifests, data-safety forms, screenshots, review notes |
| 9.10 | Documentation: `README.md`, `docs/API.md` (OpenAPI published), `docs/CONNECTORS.md` (registration guide), admin runbook, user help centre |
| 9.11 | Onboarding flow, sample-data mode, contextual tours, empty-state polish |
| 9.12 | Legal: per-connector ToS review sign-off; connector allowlist frozen for GA |

---

## LAUNCH GATES (all must be true)

- [ ] 12 Tier A/B connectors live; nightly contract tests green 7 days running
- [ ] Zero code paths automating a Tier C platform (verified by type-check + manual audit)
- [ ] Cross-tenant isolation tests passing at repository and RLS layers
- [ ] Ledger reconciles to provider statements within ±0.5% (30-day sample, accountant-reviewed)
- [ ] p95 read < 300 ms, write < 800 ms under 3× peak load
- [ ] Pen test: zero critical, zero high open
- [ ] WCAG 2.2 AA audit passed
- [ ] Arabic/RTL reviewed and signed off by a native speaker
- [ ] Backup restore drill completed successfully
- [ ] iOS + Android approved; web deployed with rollback tested
- [ ] Every connector row has `apiDocsUrl`, `tosUrl`, `verifiedAt`, `verifiedBy`

---

## POST-GA BACKLOG (priority order)

1. Connector wave 3 (BigCommerce, Kajabi, Squarespace, Wix, Ecwid, CustomCat, Teelaunch, AOP+, Inkthreadable, Yoycol, Teemill)
2. Trend/keyword research + price-elasticity engine
3. Custom report builder + scheduled email reports
4. Agency sub-accounts + white-label theming + SSO/SCIM
5. Marketplace of design templates (creator-to-creator)
6. Meilisearch migration; tablet/iPad split view; home-screen widgets
7. A/B listing tests; cohort analysis; forecast model
8. Partner applications to convert Tier B → Tier A (Zazzle, Spring, Spreadshirt)

---

## SEQUENCING RATIONALE (why this order, if you're tempted to reshuffle)

- **Tenancy before features.** RLS and tenant-scoped repositories are the one thing that cannot be retrofitted without a rewrite.
- **Catalog before connectors.** If the internal product master is shaped by the first provider's API, every subsequent connector fights the schema.
- **Connectors before publishing.** Capability flags must exist before any publish UI, or the UI will promise things platforms can't do.
- **Orders before finance.** The ledger needs real fee data from real orders; building it on synthetic data guarantees a reconciliation failure.
- **Analytics after finance.** Every meaningful metric depends on the fee decomposition. Building dashboards on gross revenue teaches users the wrong number.
- **Gigs last.** It's the least coupled module and the most likely to be cut under schedule pressure. Put it where cutting it costs nothing.
