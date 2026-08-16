# BRB — Business Requirements Brief
## OmniSell OS — Creator Commerce & Income Operations Platform

**Doc owner:** Product
**Version:** 1.0
**Status:** Approved for build
**Codename:** `omnisell`
**Last updated:** 2026-08-10

---

## 1. Executive Summary

OmniSell OS is a multi-tenant SaaS platform that lets a creator, small studio, or agency run **every income channel from one console**: print-on-demand storefronts, digital product sales, and freelance/task/testing work.

One design upload becomes many listings across many platforms. One dashboard shows real profit after platform fees, print costs, shipping, refunds, taxes, and FX. One inbox shows every order and every contract.

Delivered as:
- **Web app** (responsive, desktop-first, collapsible sidebar shell)
- **Mobile app** (iOS + Android, native shell, push, camera capture, offline queue)
- **Public API + webhooks** (so OmniSell is itself an integrable platform)
- **Admin console** (tenant ops, connector registry, moderation, billing, finance ops)

---

## 2. Problem Statement

A creator earning from POD + digital + gig work today juggles 8–20 dashboards. Consequences:

| Pain | Business impact |
|---|---|
| Manual re-upload of the same design per platform | 15–40 min per product per channel; scaling is linear labour |
| No unified P&L | Creators cannot tell which product/channel is actually profitable after fees |
| Fee opacity | Margins set by guesswork; loss-making SKUs run for months |
| Order fragmentation | Missed fulfilment SLAs, refunds, chargebacks |
| Tax/compliance chaos | VAT/OSS, US nexus, KSA ZATCA e-invoicing handled in spreadsheets |
| Gig income invisible | Freelance/task income never reconciled with product income |

---

## 3. Goals & Non-Goals

### 3.1 Business goals
| # | Goal | Success metric |
|---|---|---|
| G1 | Cut time-to-publish across N channels | ≤ 90 seconds for 1 design → 5 channels (Tier A) |
| G2 | Give true unit economics | 100% of published SKUs show landed cost, fee, net margin |
| G3 | Unify order operations | ≥ 95% of Tier A orders auto-synced within 15 min |
| G4 | Monetise via subscription + usage | ≥ 35% free→paid conversion by month 6 |
| G5 | Stay legally clean | Zero ToS-violating automated actions shipped |

### 3.2 Explicit non-goals (v1)
- **Not** building our own print facility or shipping carrier account.
- **Not** scraping or headless-browser-automating platforms that prohibit it.
- **Not** a payment processor. Stripe/Paddle/Wise are used as-is; we never hold customer funds beyond escrowed marketplace flows in v3.
- **Not** an AI image generator of record — we integrate a provider, we don't train models.
- **Not** replacing platform-native customer support.

---

## 4. Target Users & Personas

| Persona | Role in product | Primary jobs-to-be-done |
|---|---|---|
| **Solo Creator** (Layla, Khobar) | `OWNER` | Upload art, publish wide, see net profit, get paid, file VAT |
| **Studio Manager** (Omar) | `MANAGER` | Assign designers, approve listings, monitor fulfilment SLAs |
| **Designer** (Chen) | `DESIGNER` | Asset library, mockups, template mapping — no finance access |
| **Fulfilment Op** (Sara) | `FULFILLMENT` | Order queue, issues, returns, reprints |
| **Accountant** (Yusuf) | `FINANCE` | Ledger, payouts, invoices, tax exports, no design access |
| **Agency Analyst** | `ANALYST` | Read-only analytics across sub-accounts |
| **Platform Admin** (internal) | `SUPER_ADMIN` | Tenants, connectors, moderation, billing, incidents |

---

## 5. Scope — Product Pillars

1. **Studio** — asset/DAM, versioning, AI copy + AI upscale, mockup generation, print-file validation (DPI, bleed, colour profile, transparency).
2. **Catalog** — internal product master: blueprint → variant matrix → pricing rules → channel mapping.
3. **Channels** — connector registry, OAuth/API-key vault, capability matrix, health monitoring, rate-limit-aware sync.
4. **Publishing** — bulk listing composer, per-channel field transforms, scheduling, approval workflow, rejection handling, Export Packs for no-API channels.
5. **Orders & Fulfilment** — unified order feed, routing rules, tracking, exceptions, returns/reprints.
6. **Digital Products** — secure file delivery, licence keys, entitlements, download limits, coupon engine.
7. **Work & Gigs** — opportunity aggregation, application tracker, contracts, timesheets, deliverables, client invoicing.
8. **Finance** — double-entry ledger, fee decomposition, multi-currency FX, payout reconciliation, tax centre (VAT/OSS, US sales tax, KSA ZATCA).
9. **Intelligence** — channel P&L, SKU performance, trend/keyword research, price elasticity suggestions, forecast.
10. **Automations** — rule engine (`when → if → then`), schedules, webhooks, public API.
11. **Admin & Trust** — RBAC, audit log, moderation/DMCA, feature flags, observability, data-subject requests.

---

## 6. Channel Integration Policy (the load-bearing decision)

Every platform enters the registry as a versioned **Connector** with declared capabilities. Nothing is assumed.

| Tier | Definition | What the product does | Examples |
|---|---|---|---|
| **A — Full API** | Documented public API, self-serve credentials, write access permitted | Full automation: publish, sync orders, pull costs, fulfil | Printful, Printify, Gelato, Prodigi, Etsy, Shopify, WooCommerce, Gumroad, Payhip, Sellfy, Podia, Thinkific, Teachable, Paddle, FastSpring, Stripe |
| **B — Gated / partial API** | API exists but requires approval, or is read-only | Auto where permitted; user supplies approved credentials; degraded feature set flagged in UI | Zazzle (Partner API), Spring, Spreadshirt, CustomCat, Teelaunch, AOP+, Inkthreadable, Prolific, Upwork, Freelancer, Fiverr (limited) |
| **C — No write API (ToS-restricted)** | Manual upload only; automation prohibited | **Export Pack only**: generates a per-channel ZIP (print files at correct spec + `metadata.csv` + step-by-step checklist + clipboard-ready fields). User uploads manually. Publish-state tracked by user confirmation. | Redbubble, Merch by Amazon, Society6, TeePublic, Threadless, Design By Humans |
| **D — Quarantine** | Dead, merged, unverified, or fabricated domain | Hidden from users. Held in admin registry with `status=UNVERIFIED` until a human verifies live docs. | SunFrog, ViralStyle, Selz, GitHub Jobs, Stack Overflow Jobs, Figure Eight, Playment, Validately, and all unresolvable domains from the source list |

**Hard rules encoded in the codebase:**
- `connector.capabilities.canAutomate === false` → publishing UI renders Export Pack path only. There is no code path that POSTs to a Tier C platform.
- No headless browser, no credential-stuffing, no scraping of authenticated pages. Ever.
- Every connector ships with `tosUrl`, `apiDocsUrl`, `verifiedAt`, `verifiedBy`. A connector older than 180 days without re-verification auto-flags in the admin health board.

---

## 7. Functional Requirements Summary

Full enumeration lives in `featureslist.md`. Headline requirements:

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Email + OAuth (Google/Apple) auth, MFA (TOTP), passkey-ready | P0 |
| FR-02 | Multi-tenant orgs with 7 org-level roles + granular permissions | P0 |
| FR-03 | Encrypted credential vault (AES-256-GCM, envelope-encrypted, per-tenant DEK) | P0 |
| FR-04 | Connector SDK with capability matrix + health checks | P0 |
| FR-05 | Asset library with versioning, tags, print-file preflight | P0 |
| FR-06 | Product master with variant matrix and pricing rules | P0 |
| FR-07 | Bulk publish pipeline with per-channel transforms, retries, DLQ | P0 |
| FR-08 | Export Pack generator for Tier C | P0 |
| FR-09 | Unified order feed + fulfilment status machine | P0 |
| FR-10 | Digital delivery: signed URLs, expiry, download caps, licence keys | P0 |
| FR-11 | Double-entry ledger + fee decomposition + FX | P0 |
| FR-12 | Analytics: channel P&L, SKU performance, margin waterfall | P1 |
| FR-13 | Gig module: opportunities, applications, contracts, timesheets, invoices | P1 |
| FR-14 | Automation rule engine + outbound webhooks + public REST API | P1 |
| FR-15 | Admin console: tenants, connectors, queues, moderation, billing, audit | P0 |
| FR-16 | i18n EN + AR with full RTL mirroring; 6 more locales scaffolded | P0 |
| FR-17 | Tax centre: VAT/OSS, US sales tax summary, KSA ZATCA Phase-2 e-invoice XML/QR | P1 |
| FR-18 | Mobile parity: push, camera→asset, offline order queue, biometric unlock | P0 |
| FR-19 | Notification centre: in-app, email, push, digest preferences | P1 |
| FR-20 | AI Studio: listing copy, tag suggestions, translation, background removal | P1 |

---

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Performance** | p95 API < 300 ms (read), < 800 ms (write). Dashboard TTI < 2.0 s on 4G. Bulk publish 500 listings ≤ 10 min. |
| **Scale targets (12 mo)** | 25k tenants, 2M SKUs, 10M listings, 500k orders/mo, 50 connectors live. |
| **Availability** | 99.9% API. Sync workers degrade gracefully; connector outage never blocks the app. |
| **Security** | OWASP ASVS L2. Encryption at rest + in transit. Secrets in KMS. Signed webhooks (HMAC-SHA256 + timestamp + replay window). Rate limiting per tenant + per IP. Annual pen test. |
| **Privacy** | GDPR + Saudi PDPL. Data export + erasure within 30 days. Regional data residency option (EU / ME). PII field-level encryption. |
| **Accessibility** | WCAG 2.2 AA. Keyboard-complete. Screen-reader labelled. Reduced-motion honoured. Contrast ≥ 4.5:1. |
| **Observability** | OpenTelemetry traces, structured logs, RED/USE dashboards, per-connector error budgets, PagerDuty on SLO burn. |
| **Localisation** | ICU message format, locale-aware numbers/currency/dates, Hijri calendar option, full RTL. |
| **Compliance** | ZATCA Fatoora Phase 2 for KSA invoices; PCI-DSS SAQ-A (no card data touched). |

---

## 9. Commercial Model

| Plan | Price | Limits |
|---|---|---|
| **Free** | $0 | 1 seat, 3 channels, 25 SKUs, 100 listings, Export Packs unlimited, community support |
| **Creator** | $29/mo | 2 seats, 10 channels, 500 SKUs, AI Studio 500 credits, analytics, automations (5 rules) |
| **Studio** | $99/mo | 8 seats, unlimited channels, 5k SKUs, approval workflow, public API, 50 rules, priority support |
| **Agency** | $299/mo | 25 seats, sub-accounts, white-label, SSO, audit export, SLA |
| **Enterprise** | Custom | Data residency, dedicated connectors, DPA, uptime SLA |

Add-ons: AI credit packs, extra seats, extra connector slots, ZATCA e-invoicing module.

---

## 10. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Partner ToS violation via automation | **Critical** | Tier C = Export Pack only, enforced at type level. Legal review per connector before enabling. |
| Connector API breaking changes | High | Versioned adapters, contract tests against sandboxes in CI nightly, health board, graceful degradation banner. |
| Source-data rot (fake/dead platforms) | High | Quarantine tier; nothing ships to users without `verifiedAt` + live doc URL. |
| Credential breach | **Critical** | Envelope encryption, per-tenant DEK, no plaintext logging, key rotation, break-glass audit. |
| Rate-limit bans | Medium | Per-connector token-bucket, adaptive backoff, jitter, per-tenant fairness queue. |
| Cost of AI features | Medium | Credit metering, per-tenant caps, cached prompts. |
| Marketplace account bans harming users | High | Pre-publish policy linter (trademark/IP keyword check, banned-content list). |
| Scope explosion ("integrate all 300") | High | Tiering + phased rollout in `implementationplanphase.md`. 12 connectors at GA, not 300. |

---

## 11. Assumptions & Open Questions

**Assumptions**
- Users hold their own platform accounts; OmniSell never creates accounts on their behalf.
- Print costs are fetched from provider APIs where available, otherwise user-entered.
- Payouts stay on the provider's rails; OmniSell reconciles, it does not disburse (v1).

**Open questions (need answers before Phase 3)**
1. Do we pursue formal partner status with Zazzle / Spring / Spreadshirt? (Unlocks Tier B → A.)
2. Marketplace escrow — do we ever hold funds? (Regulatory weight is heavy; recommend no.)
3. Which AI provider is contracted for image ops, and what are the commercial-use rights?
4. Data residency: is ME region required at GA for KSA customers, or is EU acceptable?
5. White-label scope for Agency plan — custom domain only, or full theming?

---

## 12. Definition of Done (GA)

- 12 Tier A/B connectors live with nightly contract tests green.
- Web + iOS + Android shipped from one monorepo, feature-parity on the P0 list.
- Admin console operational: tenant suspend, connector toggle, queue replay, refund, audit export.
- Ledger reconciles to provider statements within ±0.5% on a 30-day sample.
- WCAG 2.2 AA audit passed; AR/RTL reviewed by a native speaker.
- Pen test findings: zero critical, zero high open.
- README, API reference (OpenAPI 3.1), and connector registration guide published.
