# PROMPT.md — Master Build Prompt (OmniSell OS)
Paste into Claude Code / Cursor / any agentic coding tool. Work phase by phase from `implementationplanphase.md`. Do not skip acceptance criteria.

---

## ROLE

You are a senior full-stack engineering team building **OmniSell OS**, a multi-tenant creator-commerce platform: web app + mobile app + backend API + admin console + connector integration layer. The platform also serves **Consumers** (loyalty points & wallet economy) as specified in `docs/points-extension.md`.

You write production code, not scaffolding demos. Every feature you touch ships with tests, types, error states, empty states, loading states, i18n strings, and accessibility attributes. If you cannot complete a feature properly, stub it behind a feature flag and record it in `docs/DEBT.md` — never fake it with hardcoded data in the UI.

---

## NON-NEGOTIABLE CONSTRAINTS (read first, enforce always)

1. **Legal integration boundary.** Platforms are tiered. `Connector.tier === 'C'` means **no write API exists and automation violates their Terms of Service**. For Tier C you generate an **Export Pack** (files + CSV + checklist) for manual upload by the user. You must not write any code that automates a Tier C platform — no Puppeteer, no Playwright against their site, no reverse-engineered private endpoints, no credential-based form submission. Enforce this at the type level so it is a compile error, not a code-review note:
   ```ts
   type AutomatableConnector = Connector & { capabilities: { canAutomate: true } };
   function publish(c: AutomatableConnector, ...): Promise<PublishResult>;
   ```
2. **No invented integrations.** Only implement a connector if you have its live public API documentation URL. If docs cannot be confirmed, create the registry row with `status: 'UNVERIFIED'`, `tier: 'D'`, and leave the adapter unimplemented. Never guess endpoints, never invent field names, never fabricate a base URL.
3. **Secrets never leak.** Platform credentials are envelope-encrypted (per-tenant DEK wrapped by a KMS master key), never logged, never included in any API response, never sent to the client. Only masked hints (`sk_live_••••4821`) surface in the UI.
4. **Multi-tenancy is enforced in the data layer**, not the controller. Every tenant-scoped query passes through a repository that injects `tenantId`. Add a Postgres RLS policy as a second line of defence. Write a test that proves cross-tenant reads fail.
5. **Idempotency.** Every mutating public endpoint accepts `Idempotency-Key`. Every inbound webhook is deduplicated by provider event ID.
6. **Money is integers.** Store minor units (`BIGINT`) plus ISO-4217 currency code. Never use floats for money. Never store a computed total without also storing its components.
7. **i18n from line one.** No hardcoded user-facing strings. `t('orders.empty.title')` only. Arabic RTL must work on day one, not as a retrofit.
8. **Accessibility is a build gate.** CI runs axe on key routes and fails on serious/critical violations.

---

## CONSUMER MODE — POINTS & WALLET SYSTEM (must-read extension)

OmniSell serves **Consumers** as well as Creators. Every user can switch to **Consumer Mode**: a
point wallet, videos to watch and earn points, and points redemption for checkout discounts.

**Read `docs/points-extension.md` before starting.** It is the authority for every consumer-scoped
feature: Prisma additions (§6), domain rules (§7), fraud rules (§8), new `/v1` endpoints (§9),
UI/UX (§10), Phase 4.5 plan (§11), env vars (§12), demo data (§13), the C‑1…C‑15 feature registry
(§15), and acceptance criteria (§16). Consumer features build on — they never change — the
creator-side contracts in this file.

Five additional invariants (stacked on the eight above, enforced in review):

1. **Points are integers** — `BIGINT`, every transaction audit-logged; wallet balance is *derived*
   from validated `PointTransaction` rows (the `balance` column is only a versioned projection).
2. **Points ≠ money** — closed-loop loyalty currency, never directly purchasable; the
   points→currency discount conversion rate is configurable per tenant.
3. **Earning requires consent + verified watch time** — no autoplay; server-side heartbeat
   verification; points only after a minimum watch duration and within per-user daily caps.
4. **Consumer identity is tenant-linked** — a tenant hosts both creators and consumers; one user
   toggles between Creator and Consumer modes.
5. Every new endpoint ships behind idempotency keys, RFC 9457 errors, cursor pagination, and RLS —
   the same discipline as the rest of `/v1`.

## TECH STACK (fixed — do not substitute)

**Monorepo:** Turborepo + pnpm workspaces + TypeScript 5.x strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

```
omnisell/
├─ apps/
│  ├─ api/          NestJS 10 · REST + OpenAPI 3.1 · BullMQ workers
│  ├─ web/          Next.js 15 App Router · React 19 · Tailwind · shadcn/ui
│  ├─ mobile/       Expo SDK 52 · React Native · Expo Router
│  └─ admin/        Next.js (separate shell, distinct chrome, own auth guard)
├─ packages/
│  ├─ shared/       zod schemas · domain types · enums · money utils
│  ├─ api-client/   generated typed SDK (openapi-typescript + fetch wrapper)
│  ├─ connectors/   Connector SDK + one adapter package per platform
│  ├─ ui/           design tokens + primitives shared web/native where sane
│  ├─ i18n/         locale JSON + ICU helpers
│  └─ config/       eslint · tsconfig · tailwind preset
├─ infra/           docker-compose · terraform · k8s manifests
└─ docs/            README · API · CONNECTORS · DEBT · RUNBOOK
```

| Layer | Choice |
|---|---|
| API | NestJS 10, REST, `class-validator` + zod, OpenAPI 3.1 auto-generated |
| DB | PostgreSQL 16 + Prisma ORM + RLS policies |
| Cache/Queue | Redis 7 + BullMQ (separate queues per connector) |
| Search | Postgres FTS (v1) → Meilisearch (v2) |
| Storage | S3-compatible (MinIO local), presigned uploads, tus resumable |
| Auth | JWT access 15 min + rotating refresh 30 d, argon2id hashing, TOTP MFA |
| Authz | CASL ability factory, policy guards, RLS |
| Realtime | SSE for job progress, WebSocket gateway for presence/comments |
| Web state | TanStack Query (server state) + Zustand (UI state) — no Redux |
| Forms | react-hook-form + zodResolver |
| Charts | Recharts, RTL-aware wrapper |
| Tables | TanStack Table (virtualised, column pinning, server pagination) |
| Mobile | Expo Router, TanStack Query + MMKV persistence, expo-secure-store, expo-notifications |
| Email | React Email + Resend/SES |
| Payments | Stripe Billing (subscriptions), Paddle as MoR alternative |
| Testing | Vitest (unit), Supertest (API), Playwright (E2E), Testcontainers (DB), MSW (connector mocks), Pact-style contract tests vs sandboxes |
| Observability | OpenTelemetry, Sentry, Pino structured logs, Prometheus/Grafana |
| CI/CD | GitHub Actions: lint → typecheck → unit → integration → E2E → axe → build → deploy |

---

## DESIGN DIRECTION — "Corporate Precision"

The look: an institutional-grade financial console that a creator actually enjoys opening. Confident, dense-but-breathable, restrained motion. **Not** a pastel SaaS template. **Not** gradient-soup glassmorphism.

### Tokens
```css
:root {
  /* Neutrals — cool graphite, not blue-grey mush */
  --ink-950:#0A0C10; --ink-900:#101319; --ink-800:#171B23;
  --ink-700:#232833; --ink-600:#333A47; --ink-400:#6B7484;
  --ink-200:#C9CFDA; --ink-100:#E7EAF0; --ink-50:#F6F7FA;

  /* Brand — deep indigo authority */
  --brand-600:#3B4BE8; --brand-500:#4F5FF5; --brand-400:#7A86FF;
  --brand-soft:#EEF0FF;

  /* Accent — signal amber, used sparingly for value/money highlights */
  --accent-500:#F2A73B; --accent-600:#D98A1E;

  /* Semantic */
  --success:#12A150; --warning:#D98A1E; --danger:#E5484D; --info:#0A7EA4;

  /* Elevation — layered shadow, never a single blurry blob */
  --sh-1:0 1px 2px rgba(10,12,16,.06), 0 1px 1px rgba(10,12,16,.04);
  --sh-2:0 4px 12px rgba(10,12,16,.08), 0 1px 3px rgba(10,12,16,.06);
  --sh-3:0 16px 40px rgba(10,12,16,.14), 0 2px 8px rgba(10,12,16,.08);

  --r-sm:6px; --r-md:10px; --r-lg:14px; --r-xl:20px;
  --ease:cubic-bezier(.2,.8,.2,1);
}
```

- **Type:** `Plus Jakarta Sans` for headings (tight tracking, -0.02em), `Inter` for UI, `JBM Mono`/`IBM Plex Mono` for numerals and IDs. Arabic: `IBM Plex Sans Arabic`. Tabular figures (`font-variant-numeric: tabular-nums`) on every money column.
- **Grid:** 8 px spacing scale. Sidebar 264/72 px. Content max-width 1440 px. Cards use 1 px `--ink-100` borders + `--sh-1`; elevation increases only on interaction.
- **Data density:** three table densities (comfortable/compact/dense), user-persisted. Money right-aligned. Deltas coloured + arrowed + prefixed with sign.
- **Motion:** 120–200 ms, `--ease`. Only opacity/transform. Sidebar collapse 180 ms. Charts animate once on mount, never on re-filter. Honour `prefers-reduced-motion` absolutely.
- **Signature moments** (make these excellent — they carry the "premium" impression):
  1. **Margin waterfall** — animated bar decomposing gross → fees → print → ship → tax → net.
  2. **Publish pipeline view** — live per-channel job cards streaming status, with a channel logo rail.
  3. **Capability matrix** — grid of connectors × capabilities, ✓/✗/⚠, hover explains the degradation in plain language.
  4. **Command palette** — `⌘K`, fuzzy, grouped, actionable (not just navigation).
- **Dark mode is a first-class theme**, not an inversion. Re-map surfaces to `--ink-900/800/700`, lift borders to `--ink-700`, desaturate accents 8%.

---

## DATA MODEL (Prisma — implement in full)

Core entities and their key relations. Every table: `id (cuid2)`, `createdAt`, `updatedAt`, `deletedAt?`, and tenant-scoped tables carry `tenantId` (indexed, RLS-protected).

```
Tenant ─┬─ Membership ─── User ─── Session, MfaSecret, ApiKey
        ├─ Asset ─── AssetVersion
        ├─ Collection ─── CollectionAsset
        ├─ Blueprint (provider catalog cache) ─── BlueprintVariant
        ├─ Product ─┬─ ProductVariant ─── VariantPrice
        │           ├─ DesignPlacement (assetId, area, x, y, scale, rot)
        │           └─ PricingRule
        ├─ Bundle ─── BundleItem
        ├─ Connection ─┬─ Credential (encrypted blob + keyId + maskedHint)
        │              └─ ConnectionHealthSample
        ├─ Listing ─┬─ ListingVariant (externalId, price, status)
        │           ├─ ListingFieldOverride
        │           └─ ListingEvent
        ├─ SyncJob ─── SyncJobItem   (status, attempts, lastError, payloadHash)
        ├─ ExportPack ─── ExportPackItem (confirmedByUserAt)
        ├─ Order ─┬─ OrderItem ─── Fulfilment ─── Shipment ─── TrackingEvent
        │         ├─ OrderFee (type, amountMinor, currency)
        │         └─ OrderException
        ├─ Return, Refund, Reprint
        ├─ DigitalProduct ─┬─ DigitalFile ─── DigitalFileVersion
        │                  ├─ LicenceKey
        │                  ├─ Entitlement
        │                  └─ DeliveryLog
        ├─ Coupon ─── CouponRedemption
        ├─ Opportunity, Application, Contract, Milestone, TimeEntry, Deliverable
        ├─ Invoice ─── InvoiceLine (+ ZatcaInvoiceMeta)
        ├─ LedgerEntry ─── LedgerLine (debit/credit, must balance)
        ├─ Payout ─── PayoutLine (reconciledLedgerLineId?)
        ├─ Expense, FxRate
        ├─ AutomationRule ─── AutomationRun
        ├─ Webhook ─── WebhookDelivery
        ├─ Notification, NotificationPreference
        ├─ Comment, Mention, InternalNote
        ├─ Subscription ─── UsageRecord ─── AiCreditLedger
        └─ AuditLog (append-only), FeatureFlag, FeatureFlagTarget

Global (non-tenant): ConnectorDefinition, ConnectorVersion, ConnectorCapability,
BannedTerm, Plan, Announcement, SupportTicket, AdminUser, AdminRole, DsarRequest
```

**`ConnectorDefinition` is the spine of the product — get it right:**
```prisma
model ConnectorDefinition {
  id            String   @id
  slug          String   @unique          // "printful"
  name          String
  category      ConnectorCategory          // POD | DIGITAL | ECOM | GIG | RESEARCH | PAYMENT
  tier          ConnectorTier              // A | B | C | D
  status         ConnectorStatus           // ACTIVE | BETA | GATED | UNVERIFIED | RETIRED
  authType      AuthType                   // OAUTH2_PKCE | OAUTH2 | API_KEY | PAT | NONE
  apiDocsUrl    String?
  tosUrl        String?
  verifiedAt    DateTime?
  verifiedBy    String?
  requiresPartnerApproval Boolean @default(false)
  rateLimit     Json                       // { requests, windowMs, burst }
  capabilities  Json                       // see below
  fieldSpec     Json                       // { maxTitle, maxDescription, maxTags, imageSpecs[] }
}
```
```ts
interface ConnectorCapabilities {
  canAutomate: boolean;      // false → Export Pack path only
  canPublish: boolean;  canUpdate: boolean;  canUnpublish: boolean;
  canSyncOrders: boolean;    canFulfil: boolean;
  canFetchCost: boolean;     canFetchEarnings: boolean;
  supportsWebhooks: boolean; supportsSandbox: boolean;
  ordersMechanism: 'webhook' | 'poll' | 'none';
}
```

---

## CONNECTOR SDK (implement exactly this shape)

```ts
export interface ConnectorAdapter {
  readonly slug: string;
  readonly capabilities: ConnectorCapabilities;

  // Auth
  buildAuthUrl?(ctx: AuthCtx): string;
  exchangeCode?(ctx: AuthCtx, code: string): Promise<TokenSet>;
  refresh?(ctx: AuthCtx, t: TokenSet): Promise<TokenSet>;
  verifyCredentials(ctx: Ctx): Promise<HealthResult>;

  // Catalog
  fetchBlueprints?(ctx: Ctx): Promise<Blueprint[]>;
  fetchCosts?(ctx: Ctx, ids: string[]): Promise<CostQuote[]>;

  // Publishing  (only present when capabilities.canAutomate === true)
  publish?(ctx: Ctx, input: PublishInput): Promise<PublishResult>;
  update?(ctx: Ctx, input: UpdateInput): Promise<PublishResult>;
  unpublish?(ctx: Ctx, externalId: string): Promise<void>;

  // Orders
  pullOrders?(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>>;
  handleWebhook?(ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]>;
  submitFulfilment?(ctx: Ctx, input: FulfilInput): Promise<Fulfilment>;

  // Money
  fetchEarnings?(ctx: Ctx, range: DateRange): Promise<EarningsRow[]>;

  // Tier C
  buildExportPack?(ctx: Ctx, input: PublishInput): Promise<ExportPackSpec>;

  mapError(e: unknown): ConnectorError;  // → { code, retryable, userMessage, docsHint }
}
```

Every adapter ships with: MSW-mocked unit tests, a nightly contract test against the provider sandbox (skipped in PR CI, required in nightly), a `README.md` documenting scopes and gotchas, and a rate-limit config.

---

## API SURFACE (REST, versioned `/v1`, OpenAPI 3.1)

```
Auth        POST /auth/register · /login · /refresh · /logout · /mfa/setup · /mfa/verify
            POST /auth/password/forgot · /reset   GET /auth/sessions   DELETE /auth/sessions/:id
Tenants     GET|POST /tenants · GET|PATCH /tenants/:id · POST /tenants/:id/invites
            GET /tenants/:id/members · PATCH /members/:id (role) · DELETE /members/:id
Assets      POST /assets/upload-init (presigned/tus) · POST /assets · GET /assets
            GET|PATCH|DELETE /assets/:id · POST /assets/:id/preflight · POST /assets/:id/versions
AI          POST /ai/copy · /ai/tags · /ai/translate · /ai/bg-remove · /ai/upscale
            GET  /ai/credits
Catalog     GET /blueprints · GET /blueprints/:id
            GET|POST /products · GET|PATCH|DELETE /products/:id
            POST /products/:id/variants:bulk · POST /products/:id/duplicate
            GET|POST /pricing-rules · POST /pricing/preview
Channels    GET /connectors  (capability matrix)
            GET|POST /connections · GET|DELETE /connections/:id
            GET /connections/:id/oauth/start · GET /oauth/callback/:slug
            POST /connections/:id/test · GET /connections/:id/health
Publishing  POST /listings:publish (multi-channel) · POST /listings:dry-run
            GET /listings · GET|PATCH /listings/:id · POST /listings/:id/retry
            POST /listings:bulk (publish|unpublish|reprice|retag|resync)
            GET  /sync-jobs · GET /sync-jobs/:id (SSE stream) · POST /sync-jobs/:id/replay
Export      POST /export-packs · GET /export-packs/:id/download · POST /export-packs/:id/confirm
Orders      GET /orders · GET /orders/:id · POST /orders/:id/fulfil
            POST /orders/:id/hold|release|cancel · POST /orders/:id/refund
            POST /orders/:id/reprint · GET /orders/exceptions
Digital     GET|POST /digital-products · POST /digital-products/:id/files
            POST /digital-products/:id/licences · GET /entitlements · POST /deliveries/:id/resend
            GET|POST /coupons
Gigs        GET /opportunities · GET|POST /applications · GET|POST /contracts
            POST /time-entries · POST /contracts/:id/invoice
Finance     GET /earnings · GET /fees · GET /ledger · GET /payouts
            POST /payouts/:id/reconcile · GET|POST /expenses
            GET /tax/vat-summary · GET /tax/us-summary · POST /tax/zatca/invoice
            GET /reports/pnl · GET /exports/accounting
Analytics   GET /analytics/overview · /channel-pnl · /product-performance · /anomalies
            POST /reports · GET /reports/:id
Automation  GET|POST /rules · POST /rules/:id/test · GET /rules/:id/runs
            GET|POST /webhooks · GET /webhooks/:id/deliveries · POST /deliveries/:id/replay
Platform    GET /notifications · PATCH /notifications/:id/read · GET|PATCH /preferences
            GET|POST /api-keys · GET /audit-logs · GET /feature-flags
Billing     GET /plans · POST /subscription · POST /subscription/cancel · GET /invoices
Admin       /admin/* mirrors of the above with global scope + tenant actions,
            connector registry CRUD, queue ops, moderation, DSAR, flags, announcements
Webhooks-in POST /hooks/:slug   (signature-verified, idempotent, 2xx fast + async process)
Health      GET /healthz · /readyz · /metrics
```

Conventions: cursor pagination (`?cursor=&limit=`), `Idempotency-Key` on POST, RFC 9457 problem+json errors, `X-Request-Id` echoed, ETag on collections, 429 with `Retry-After`.

---

## BUILD ORDER

Follow `implementationplanphase.md` phase by phase. At the end of each phase, before moving on:
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` all green.
2. Update `README.md`, `docs/API.md`, `docs/CONNECTORS.md`, `CHANGELOG.md`.
3. Write a `docs/phases/PHASE_N_REPORT.md` — what shipped, what's stubbed, what's in `DEBT.md`.
4. Run `pnpm axe` and fix serious/critical.
5. Verify Arabic RTL on every new screen. A screen that breaks in RTL is not done.

---

## PER-FEATURE DEFINITION OF DONE

A feature is complete only when **all** of these exist:

- [ ] zod schema in `packages/shared`, reused by API validation and client forms
- [ ] Prisma migration + repository with `tenantId` scoping + RLS policy
- [ ] Service layer with unit tests (happy + 3 failure paths minimum)
- [ ] Controller with authz guard, rate limit, OpenAPI decorators, idempotency
- [ ] Integration test hitting real Postgres/Redis via Testcontainers
- [ ] Web UI: loading skeleton, empty state, error state with retry, success feedback
- [ ] Mobile UI where the feature is in the mobile scope
- [ ] i18n keys added to `en.json` and `ar.json`; RTL verified
- [ ] a11y: labels, roles, focus order, keyboard operation, axe clean
- [ ] Audit-log event emitted for mutations
- [ ] Analytics event emitted
- [ ] Docs updated

---

## THINGS THAT WILL BE REJECTED IN REVIEW

- `any`, `as unknown as`, `@ts-ignore` without an adjacent justification comment
- `console.log` in shipped code (use the Pino logger)
- Direct `prisma.x.findMany()` in a controller (must go through a repository)
- A UI that renders mock/hardcoded data
- A connector adapter without a real documented API URL
- Money as `number` float, or a total without stored components
- Hardcoded English strings
- A new screen that has not been checked in Arabic/RTL
- Any code path that automates a Tier C platform
- A migration without a tested down-path or a documented forward-fix
- A queue consumer without an idempotency guard and a DLQ

---

## SPECIAL INSTRUCTIONS

**Regional (KSA/GCC):** VAT 15%, Arabic-first bilingual invoices, ZATCA Fatoora Phase-2 (UBL 2.1 XML, cryptographic stamp, TLV base64 QR, clearance + reporting APIs) behind flag `zatca_einvoicing`. Support Hijri date display. Design for `mada` and local payment methods on the billing side via Stripe/Paddle method availability.

**When you hit an unknown:** stop and write the question into `docs/OPEN_QUESTIONS.md` with your recommended default, implement the default behind a flag, and continue. Do not silently guess at a provider's API contract.

**When a provider's API contradicts this spec:** the provider wins. Update the connector README, adjust the capability flags, and note it in the phase report.
