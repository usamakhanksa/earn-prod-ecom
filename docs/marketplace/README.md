# GlobalMart (marketplace-*) — Phase 1

**GlobalMart** is a working name (placeholder — used only in README/UI copy strings,
not embedded in code identifiers, so renaming later is trivial) for a country-aware
global marketplace and monetization platform: e-commerce/product discovery, supplier
registration, customer accounts, affiliate registration/attribution, dropshipping
supplier integration, tasks/offers, referrals/rewards, an earnings/payout wallet,
admin management, country-specific payment/marketplace config, analytics, and support.

## Relationship to OmniSell OS

This is a **separate, independent product** living in the same monorepo as OmniSell OS
(`apps/{api,web,admin,mobile}`, `packages/*`). It shares only root-level monorepo
tooling — pnpm workspaces, Turborepo, the root ESLint/Prettier/TS conventions — never
business logic, a database, or auth. Concretely:

- New workspace members use their own `@marketplace/*` npm scope, distinct from
  OmniSell's `@omnisell/*`.
- Its own Prisma schema/database, with its own env var name
  (`MARKETPLACE_DATABASE_URL`), so it never collides with OmniSell's `DATABASE_URL`.
- Its own `packages/marketplace-config` (tsconfig/eslint base) — **not** a dependency
  on `@omnisell/config`, because that package's Tailwind preset in particular is
  OmniSell-branded ("Corporate Precision" design system, brand color tokens). The
  generic strict-TypeScript/ESLint conventions were re-authored standalone instead.
- No root-level file was modified to make this work: `pnpm-workspace.yaml` already
  globs `apps/*`/`packages/*`, and `turbo.json`'s `dev`/`build`/`typecheck`/`test`/`lint`
  tasks are generic task names, not app-specific — any new workspace member that
  defines matching npm scripts is automatically wired into the same pipeline. The one
  exception, documented for transparency: `apps/marketplace-api/prisma/schema.prisma`'s
  Prisma `generator client` block sets a package-local `output` path
  (`../src/generated/prisma-client`) instead of the default. The root `.npmrc` sets
  `node-linker=hoisted` (kept as-is — it exists for OmniSell's own Expo app, not ours to
  change), which flattens every workspace into one shared `node_modules`; without a
  custom output path, `prisma generate` here would have written into the very same
  `node_modules/@prisma/client` OmniSell's own `apps/api` schema generates into,
  clobbering it. This was a real, reproduced failure during this build (see DEBT.md).

## Workspace layout

```
apps/
  marketplace-api/       backend — Express + TypeScript + Prisma (PostgreSQL)
  marketplace-web/       public/customer/supplier/affiliate frontend — Next.js App Router
  marketplace-mobile/    Expo + TypeScript app, consumes the same API as web
packages/
  marketplace-shared/    zod schemas, domain types/enums, typed API client
  marketplace-country/   country detection + configuration engine (first-class package)
  marketplace-config/    standalone shared tsconfig/eslint base (this app family's own,
                          analogous to packages/config but not derived from it)
```

**Admin decision**: the spec allows either a separate `apps/marketplace-admin` Next.js
app or a protected route group inside `marketplace-web`. This pass builds **no admin
UI at all** (Phase 1's own scope is just home + login/register), so building an empty
`apps/marketplace-admin` placeholder would violate the spec's own instruction not to.
The decision, for when admin surfaces do get built: **a protected route group inside
`marketplace-web`** (e.g. `app/admin/*`, guarded by `requireRole('ADMIN', 'SUPER_ADMIN', ...)`
against the same `marketplace-api`), not a separate app — there is no admin-specific
tech-stack requirement (no separate deploy target, no separate design system) that
would justify a 4th Next.js app. Revisit if that changes.

## Local setup

```bash
# from repo root
node_modules/.bin/pnpm install

# generate the Prisma client (writes to apps/marketplace-api/src/generated/, gitignored)
cd apps/marketplace-api
MARKETPLACE_DATABASE_URL=postgresql://marketplace:marketplace@localhost:5432/globalmart \
  ../../node_modules/.bin/pnpm exec prisma generate

# copy env templates
cp apps/marketplace-api/.env.example apps/marketplace-api/.env
cp apps/marketplace-web/.env.example apps/marketplace-web/.env.local

# run the API (MOCK_MODE=true by default — no Postgres needed)
node_modules/.bin/pnpm --filter @marketplace/api dev     # http://localhost:4100

# run the web app (in another terminal)
node_modules/.bin/pnpm --filter @marketplace/web dev     # http://localhost:3100
```

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `MOCK_MODE` | marketplace-api | `true` (default): every repository/provider resolves to its in-memory mock implementation. This is the actual state of this sandbox. |
| `MARKETPLACE_DATABASE_URL` | marketplace-api | Postgres connection string. Distinct name from OmniSell's `DATABASE_URL` on purpose. Not required when `MOCK_MODE=true`. |
| `JWT_SECRET` | marketplace-api | Signs/verifies auth JWTs. Falls back to a fixed dev-only value with a printed warning if unset outside production; **required** when `NODE_ENV=production`. |
| `MARKETPLACE_WEB_URL` | marketplace-api | CORS allow-origin for the web app (credentials-enabled, so must be an exact origin). |
| `IP_GEOLOCATION_API_KEY` | marketplace-api | Real IP geolocation vendor key. Left blank — no real vendor contract was provided this pass; only the `GeolocationProvider` interface + `MockGeolocationProvider` exist. |
| `CJ_API_KEY` / `CJ_API_BASE_URL` | marketplace-api | Placeholders for a **later phase's** `CJDropshippingProvider` adapter. Never populated with the real key from chat — see the security note below. |
| `NEXT_PUBLIC_MARKETPLACE_API_URL` | marketplace-web | Base URL of marketplace-api, used by the shared typed client. |
| `EXPO_PUBLIC_MARKETPLACE_API_URL` | marketplace-mobile | Same, for the Expo app. |

See `apps/marketplace-api/.env.example` and `apps/marketplace-web/.env.example` for the
full, commented templates. No real secrets are committed anywhere.

## MOCK_MODE — what it actually proves

With `MOCK_MODE=true` (the default, and this sandbox's actual state — no live Postgres
or geolocation credential is available here), `marketplace-api` boots and serves real
responses from in-memory repositories/providers implementing the exact same interfaces
a Prisma-backed / real-geolocation-backed implementation would:

- `MockUserRepository` / `MockCountryConfigRepository` (in `packages/marketplace-country`
  and `apps/marketplace-api/src/repositories`) vs. `PrismaUserRepository` /
  `PrismaCountryConfigRepository` — chosen by `apps/marketplace-api/src/repositories/repository-factory.ts`
  based solely on `env.hasRealDatabase`.
- `MockGeolocationProvider` (in `packages/marketplace-country`) vs. a real HTTP-backed
  provider — the interface + factory (`createGeolocationProvider`) exist; the real
  implementation is not built this pass (no vendor contract was provided — see DEBT.md).

This was verified by actually booting both services and exercising them for real (not
paraphrased) — see `docs/marketplace/PHASE_1_REPORT.md` for the exact commands and
output.

## What's built vs. not yet

**Built this pass:**
- 6 workspace members, each with real `dev`/`build`/`typecheck`/`test`/`lint` scripts.
- `Country`, `Currency`, `Language`, `CountryConfig`, `User` (+ `Role` enum),
  `Category`, `Product`, `ProductImage`, `ProductVariant`, `Supplier`, `Affiliate`
  Prisma models; a real generated initial migration SQL (schema-diffed, not hand-typed,
  via `prisma migrate diff --from-empty`).
- USER registration/login/logout/me, bcryptjs password hashing, JWT auth (cookie +
  bearer), role-based guard middleware (`requireAuth`/`requireRole`) reusable by later
  Supplier/Affiliate/Admin login surfaces.
- `CountryDetectionService`'s exact 5-layer strategy (profile → override → locale → IP
  geolocation → fallback), `CountryConfigService` (data-driven, 9 seeded countries: SA,
  US, GB, DE, IN, PK, BR, NG, AU).
- Home page (shows live-detected country), login/register pages, all validated with
  the same Zod schema client-side (React Hook Form) and server-side (Express
  middleware) — real loading/error/success states throughout.
- A typed `MarketplaceApiClient` (`packages/marketplace-shared`) shared by web and
  mobile — no endpoint is implemented twice.

**Not yet (see DEBT.md for the full list):**
- Supplier/Affiliate/Admin self-registration UIs (the service layer already supports
  arbitrary roles; only the USER HTTP surface is wired this pass).
- Orders, wallet/payouts, tasks/offers, commission/attribution calculation, referrals —
  out of Phase 1 scope by design.
- Real IP geolocation vendor integration, real CJ Dropshipping adapter — interfaces
  only, mock/placeholder active.
- Never exercised against a live Postgres (no Docker/DB in this sandbox) — only
  `prisma validate`/`prisma generate`/`prisma migrate diff` were run for real.

## Commands verified in this sandbox

See `docs/marketplace/PHASE_1_REPORT.md` for the literal command transcripts (install,
build, typecheck, test, and the live boot + curl + headless-browser proof).
