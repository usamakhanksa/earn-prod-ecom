# GlobalMart (marketplace-*) — Phase 1 Report

**Scope of this pass:** spec sections 1–10, 39, 41–46 — project setup, initial Prisma
schema, USER auth, country detection, country configuration engine, MOCK_MODE, env
template, and a minimal home/login/register vertical slice. This is **Phase 1 of a
large multi-phase build** — not a finished product. No "production ready" claim is
made anywhere below.

## Status: IMPLEMENTED and boot-verified for this pass's scope

## What shipped

- **Project setup** — 6 new workspace members (`apps/marketplace-api`,
  `apps/marketplace-web`, `apps/marketplace-mobile`, `packages/marketplace-shared`,
  `packages/marketplace-country`, `packages/marketplace-config`), each with a real
  `package.json`, `tsconfig.json` extending `@marketplace/config`'s standalone strict
  base, an `eslint.config.mjs`, and matching `dev`/`build`/`typecheck`/`test`/`lint`
  npm scripts. No edits were needed to root `pnpm-workspace.yaml` (already globs
  `apps/*`/`packages/*`) or `turbo.json` (its `build`/`typecheck`/`test`/`lint` tasks
  are generic task names, not app-specific — matching npm scripts is all that's
  required for turbo to pick a new workspace member up).
- **Prisma schema** — `apps/marketplace-api/prisma/schema.prisma`: `User`/`Role` enum,
  `Country`, `Currency`, `Language`, `CountryConfig`, `Category`, `Product`,
  `ProductImage`, `ProductVariant`, `Supplier` (+`SupplierStatus`), `Affiliate`
  (+`AffiliateStatus`). A real initial migration was generated via
  `prisma migrate diff --from-empty --to-schema-datamodel` (schema-diffed SQL, not
  hand-typed) at `apps/marketplace-api/prisma/migrations/20260101000000_init/migration.sql`.
- **Auth** — `AuthService` (register/login/getSanitizedUser), generic across roles;
  bcryptjs password hashing (documented choice: pure-JS, no native build step, over
  argon2/bcrypt); JWT (cookie + Bearer) via `jsonwebtoken`; `requireAuth`/`requireRole`
  guard middleware. HTTP surface: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`.
- **Country detection** — `CountryDetectionService` (packages/marketplace-country)
  implementing the exact 5-layer strategy (profile → override → locale → geolocation →
  fallback), returning exactly `{ countryCode, countryName, currency, language,
  timezone }`. `GeolocationProvider` interface + `MockGeolocationProvider`. Wired into
  `GET /api/country/detect` (reads the `marketplace_country` cookie + `Accept-Language`
  + client IP) and `POST /api/country/override` (validates against
  `CountryConfigService`, persists a 1-year cookie).
- **Country configuration engine** — `CountryConfigService`/repository interface, a
  `MockCountryConfigRepository` seeded with 9 real countries (SA, US, GB, DE, IN, PK,
  BR, NG, AU — currency/symbol/language/timezone/payments/marketplaces/shipping per
  country), and a `PrismaCountryConfigRepository` implementing the identical interface
  for later use. No `if (country === 'SA')` branches anywhere in route/UI code.
- **MOCK_MODE** — `env.hasRealDatabase`/`repository-factory.ts` choose mock vs. Prisma
  repositories from one flag; proven end-to-end by actually booting the stack (below).
- **`.env.example`** at `apps/marketplace-api/.env.example` and
  `apps/marketplace-web/.env.example`, real variable names, no real secrets.
- **Vertical slice UI** — `marketplace-web`: home page (live country-detection card
  with loading/error/success states), `/login`, `/register` (React Hook Form + Zod,
  the exact same schema instances the API validates with server-side).

## Commands run, with real output

### Install (17 workspace projects — the 11 pre-existing OmniSell ones + 6 new)

```
$ node_modules/.bin/pnpm install
Scope: all 17 workspace projects
...
Packages: +150 -183
Done in 1m 17.6s
```

No `unmet peer` warning was printed for `@marketplace/web` (Next 14.2.18 + React
18.3.1 + `@types/react` 18.3.12 — a peer range that actually matches, chosen
specifically to avoid the pre-existing `next@15.0.3` + `react@19.0.0` mismatch already
on record for OmniSell's `apps/admin`/`apps/web`, which *did* still print its own
unmet-peer warning on this same install run — that one is pre-existing OmniSell state,
untouched by this work).

### Prisma (schema-only checks — no live Postgres in this sandbox)

```
$ MARKETPLACE_DATABASE_URL=postgresql://marketplace:marketplace@localhost:5432/globalmart \
    pnpm exec prisma validate
The schema at prisma\schema.prisma is valid 🚀

$ MARKETPLACE_DATABASE_URL=... pnpm exec prisma generate
✔ Generated Prisma Client (v5.22.0) to .\src\generated\prisma-client in 186ms

$ MARKETPLACE_DATABASE_URL=... pnpm exec prisma migrate diff \
    --from-empty --to-schema-datamodel prisma/schema.prisma --script \
    > prisma/migrations/20260101000000_init/migration.sql
# 266 lines of real, schema-diffed SQL generated (CreateEnum/CreateTable/CreateIndex)
```

### Typecheck — all 5 TypeScript-checked packages (mobile uses `tsc --noEmit` too)

```
$ pnpm --filter @marketplace/shared --filter @marketplace/country \
    --filter @marketplace/api --filter @marketplace/web --filter @marketplace/mobile typecheck
packages/marketplace-shared typecheck: Done
packages/marketplace-country typecheck: Done
apps/marketplace-web typecheck: Done
apps/marketplace-mobile typecheck: Done
apps/marketplace-api typecheck: Done
```

Two real issues were found and fixed while getting this green (not pre-existing —
introduced and caught in this same pass):
- `exactOptionalPropertyTypes` (from the shared strict tsconfig base) rejected two spots
  in `MarketplaceApiClient` where an optional field was assigned a `T | undefined`
  value without the property's own type explicitly including `undefined`.
- A real `@types/express` v4/v5 conflict caused by the root `.npmrc`'s
  `node-linker=hoisted` (see DEBT.md 1-D10) — fixed with a documented, narrow
  `as unknown as RequestHandler` cast at the one affected call site
  (`cookieParser()` in `apps/marketplace-api/src/app.ts`).

### Build

```
$ MARKETPLACE_DATABASE_URL=... pnpm --filter @marketplace/shared \
    --filter @marketplace/country --filter @marketplace/api build
packages/marketplace-shared build: Done   (tsc -p tsconfig.json)
packages/marketplace-country build: Done  (tsc -p tsconfig.json)
apps/marketplace-api build: Done          (tsc -p tsconfig.json)

$ pnpm --filter @marketplace/web build
  ▲ Next.js 14.2.18
   Creating an optimized production build ...
 ✓ Compiled successfully
 ✓ Generating static pages (6/6)
Route (app)                              Size     First Load JS
┌ ○ /                                    6.97 kB         124 kB
├ ○ /_not-found                          873 B            88 kB
├ ○ /login                               2.61 kB         131 kB
└ ○ /register                            2.73 kB         131 kB

$ pnpm --filter @marketplace/mobile build   # expo export --platform web
Web Bundled 8122ms ... index.ts (174 modules)
_expo/static/js/web/index-87143fa767a9c0f9fa274854b701bd6c.js (347 kB)
Exported: dist
```

`next build` was explicitly verified (not just `next dev`), per this sandbox's known
risk that a Next/React peer mismatch can silently break `build` — it did not, here.

### Test — 37 tests, all passing, across all 5 packages

```
$ pnpm --filter @marketplace/shared --filter @marketplace/country \
    --filter @marketplace/api --filter @marketplace/web --filter @marketplace/mobile test

packages/marketplace-shared test:  ✓ test/schemas.test.ts (7 tests)
packages/marketplace-country test: ✓ test/country-config.service.test.ts (8 tests)
                                    ✓ test/country-detection.service.test.ts (8 tests)
apps/marketplace-mobile test:      ✓ test/api-client.test.ts (2 tests)
apps/marketplace-web test:         ✓ test/utils.test.ts (3 tests)
apps/marketplace-api test:         ✓ test/auth.service.test.ts (5 tests)
                                    ✓ test/password.test.ts (4 tests)
```

The three explicitly required areas are covered for real:
- **Country detection resolution order** — 8 tests in
  `packages/marketplace-country/test/country-detection.service.test.ts`, one per layer
  (profile beats override beats locale beats geolocation beats fallback), plus a test
  that an unsupported code is skipped rather than trusted, and a test that geolocation
  is never called once an earlier layer resolves.
- **Country config lookup** — 8 tests in
  `packages/marketplace-country/test/country-config.service.test.ts` (all 9 seeded
  countries active, correct per-country data, case-insensitivity, unknown/inactive
  codes rejected, fallback resolution, missing-fallback error).
- **Auth password hashing/verification** — 4 tests in
  `apps/marketplace-api/test/password.test.ts` (hash differs from plaintext, correct
  password verifies, wrong password rejected, same password produces different hashes
  per call thanks to bcrypt's random salt) — plus 5 more in `auth.service.test.ts`
  exercising the full register/login flow against the mock repository.

## Live boot test (the part this sandbox can verify at full honesty, unlike Docker-gated equivalents)

```
$ cd apps/marketplace-api && MOCK_MODE=true PORT=4100 MARKETPLACE_WEB_URL=http://localhost:3100 \
    tsx src/server.ts
[env] JWT_SECRET is not set — using a fixed development-only fallback. ...
[marketplace-api] listening on http://localhost:4100 (MOCK_MODE=true, database=in-memory mock)
```

```
$ curl http://localhost:4100/health
{"status":"ok","mockMode":true,"timestamp":"2026-08-13T14:16:06.802Z"}

$ curl http://localhost:4100/api/countries          # all 9 seeded countries, isActive:true
[{"code":"SA", ...}, {"code":"US", ...}, ... {"code":"AU", ...}]

$ curl http://localhost:4100/api/country/detect      # no signals -> fallback
{"countryCode":"US","countryName":"United States","currency":"USD","language":"en","timezone":"America/New_York"}

$ curl -H "Accept-Language: ar-SA,en;q=0.8" http://localhost:4100/api/country/detect
{"countryCode":"SA","countryName":"Saudi Arabia","currency":"SAR","language":"ar","timezone":"Asia/Riyadh"}

$ curl -X POST -d '{"countryCode":"ZZ"}' http://localhost:4100/api/country/override
{"message":"Country \"ZZ\" is not supported by this marketplace yet."}   # 422, correctly rejected

$ curl -X POST -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"super-secret-1"}' \
    http://localhost:4100/api/auth/register
{"user":{"id":"90510092-...","name":"Ada Lovelace","email":"ada@example.com","role":"USER", ...},"token":"eyJ..."}

$ curl -X POST -d '{"name":"Ada 2","email":"ada@example.com","password":"whatever12"}' \
    http://localhost:4100/api/auth/register        # HTTP 409, duplicate correctly rejected
$ curl -X POST -d '{"email":"ada@example.com","password":"wrong"}' http://localhost:4100/api/auth/login
                                                     # HTTP 401
$ curl -b cookies.txt http://localhost:4100/api/auth/me
{"id":"90510092-...","name":"Ada Lovelace", ...}    # cookie-authenticated, correct user
$ curl http://localhost:4100/api/auth/me            # no cookie -> HTTP 401
$ curl -X POST -d '{"name":"A","email":"not-an-email","password":"short"}' \
    http://localhost:4100/api/auth/register
{"message":"Validation failed.","issues":[
  {"path":"name","message":"Name must be at least 2 characters"},
  {"path":"email","message":"Enter a valid email address"},
  {"path":"password","message":"Password must be at least 8 characters"}]} # HTTP 400
```

```
$ cd apps/marketplace-web && NEXT_PUBLIC_MARKETPLACE_API_URL=http://localhost:4100 \
    pnpm --filter @marketplace/web dev
  ▲ Next.js 14.2.18
  - Local: http://localhost:3100
 ✓ Ready in 2.4s

$ curl http://localhost:3100/     # 200, contains <title>GlobalMart</title>, both CTAs, the
                                   #  server-rendered "Detecting your country…" loading skeleton
$ curl http://localhost:3100/login     # 200, id="email"/id="password" fields present
$ curl http://localhost:3100/register  # 200, id="name"/id="email"/id="password" fields present
```

**Headless-browser proof that the client-side fetch actually resolves** (curl alone
can't execute client JS, so this is the step that proves the vertical slice, not just
static HTML):

```
GET http://localhost:3100/ in a real (Patchright/Chromium) browser, waited for hydration:
  rendered text includes: "United States (US)" / "Currency: USD · Language: en ·
  Timezone: America/New_York" / "Detected via marketplace-country's layered strategy
  (MOCK_MODE)."
  console errors: 0   failed requests: 0
```

This surfaced one real bug (fixed, see DEBT.md "Fixed during this build"): the shared
`MarketplaceApiClient`'s default `fetchImpl` was an unbound `fetch` reference, which
throws `Illegal invocation` when called as `this.fetchImpl(...)` in a real browser —
invisible to curl/Node testing, only caught by actually loading the page in a browser.
Fixed by binding to `globalThis`; re-verified afterward (the render above is *post-fix*).

A real cross-origin, credentialed `POST` from the browser's own JS context
(`fetch('http://localhost:4100/api/auth/register', { credentials: 'include', ... })`
executed inside the loaded `localhost:3100` page) also succeeded and returned a
newly-created user — confirming CORS + cookies work correctly for the same code path
the login/register forms use, not just for the GET-based country detection.

## Mock-only vs. real (accurate as of this pass)

| Piece | State |
|---|---|
| User auth (register/login/logout/me) | **Real code**, running against an in-memory `MockUserRepository` (no live DB in this sandbox) |
| Country detection (5-layer strategy) | **Real code**, fully exercised, all 5 layers tested and curl-verified |
| Country config (9 countries) | **Real, data-driven** seed data; not the eventual 30+ country catalog |
| Geolocation | **Mock provider only** — no real vendor key/contract |
| CJ Dropshipping | **Not built** — placeholders only, next phase |
| Database | **Never touched a live Postgres** — schema/client/migration generation verified for real; runtime always used the mock repositories |
| Web/mobile UI | **Real, running, boot-verified** for the Phase 1 scope (home + login + register) |

## Security note

The CJ Dropshipping API key pasted in chat during planning was not used, stored,
logged, or referenced anywhere in this codebase. See `docs/marketplace/DEBT.md`'s
"Security note" for the full statement.
