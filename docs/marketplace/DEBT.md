# GlobalMart (marketplace-*) — Technical Debt Register

> Same discipline as OmniSell's own `docs/DEBT.md`: incomplete features are flagged and
> listed here, and a flagged/stubbed entry is never presented to users as real data.
> This is a **separate register** for the marketplace-* app family — nothing here is
> mixed into OmniSell's own debt log.

| ID | Area | Debt | Flag / Guard | Planned fix |
|---|---|---|---|---|
| 1-D1 | Infra | No Docker/live Postgres in this sandbox — the Prisma schema, generated client, and generated migration SQL were never executed against a real database | `MOCK_MODE=true` (default); `prisma validate`/`prisma generate`/`prisma migrate diff` were run for real | Run `prisma migrate deploy` against a real Postgres once provisioned |
| 1-D2 | api | Real IP geolocation vendor integration not built — only `GeolocationProvider` interface + `MockGeolocationProvider` (packages/marketplace-country/src/geolocation) exist | `IP_GEOLOCATION_API_KEY` left blank in `.env.example`; `createGeolocationProvider()` always returns the mock | Implement an `IpGeolocationHttpProvider` once a specific vendor + real key are chosen — no documented vendor contract was given for this build, and inventing one would violate the "never invent an undocumented API endpoint" rule |
| 1-D3 | api | CJ Dropshipping adapter not built at all this phase — `Supplier.cjApiLinked` is a plain boolean placeholder column | `CJ_API_KEY`/`CJ_API_BASE_URL` left blank | Build a `CJDropshippingProvider` against the real documented endpoint paths (`/product/query`, `/product/list`, `/shopping/order/list`, `/shopping/order/createOrderV3`, `/logistic/getTrackInfo`, `/authentication/getAccessToken`, `/authentication/refreshAccessToken`) in a later phase, once a fresh (non-exposed) API key is supplied by the user via env — never hardcoded |
| 1-D4 | api | Single long-lived (7 day) JWT, no refresh-token rotation or revocation list | Documented choice in `src/modules/auth/jwt.ts` | Add refresh tokens + a revocation store (needs persistence — real DB) in a later phase, matching how session/security-sensitive flows should work |
| 1-D5 | api | Auth service is generic across roles (`RegisterParams.role`), but only the `USER` HTTP surface (`/api/auth/register`, `/login`) is wired — Supplier/Affiliate/Admin self-registration endpoints don't exist yet | — | Add role-specific routes reusing the same `AuthService`; add invite-only creation for ADMIN/SUPER_ADMIN/SUPPORT/FINANCE |
| 1-D6 | api | `User.countryCode` has no DB-level FK/constraint against `Country`/`CountryConfig` — validity enforced only at the service layer (`CountryConfigService.getByCode`) | Documented in schema.prisma comment | Consider a DB CHECK/trigger once real Postgres is provisioned |
| 1-D7 | Schema | Prisma id defaults use `cuid()` not `cuid2()` — Prisma 5.x ships no built-in `cuid2()` generator (same known limitation as OmniSell's own schema) | schema comment | Re-evaluate with a Prisma major upgrade or a custom default |
| 1-D8 | Tooling | `pnpm --filter <marketplace-package> lint` reports `Parsing error: ... was not found by the project service` for config/test files that sit outside each package's `tsconfig.json` `include` (e.g. `eslint.config.mjs`, `vitest.config.ts`, `test/*.test.ts`) — actual `src/**` files lint cleanly | Not fixed | Same root cause and same decision OmniSell already made in its own 1-D8: `projectService: { allowDefaultProject: [...] }` is the textbook fix but is known (from OmniSell's own build) to blow up Node's memory across a monorepo this size. Needs a dedicated, carefully-scoped pass (e.g. a second, narrower tsconfig for lint-only, or per-package `ignorePatterns`) rather than a quick fix here |
| 1-D9 | Prisma / tooling | The root `.npmrc`'s `node-linker=hoisted` flattens all workspace `node_modules`. `apps/marketplace-api/prisma/schema.prisma` therefore sets a package-local Prisma `generator client { output = ... }` instead of the default `node_modules/@prisma/client` — otherwise `prisma generate` here would silently overwrite OmniSell's own generated Prisma client (and vice versa), since both apps' `@prisma/client` would resolve to the same hoisted location | `output = "../src/generated/prisma-client"`; that path is `.gitignore`d in `apps/marketplace-api/.gitignore` | None needed — this is the permanent, correct fix, not a workaround |
| 1-D10 | Tooling | Same hoisted-node_modules effect caused a real, reproduced `@types/express` version conflict (OmniSell's `apps/api` pins `@types/express@5.0.0`; ours needs `4.17.21` to match Express 4 at runtime) — cookie-parser's own bundled types resolve against whichever `express-serve-static-core` is closest on disk, which was the *wrong* version for one call site | `app.use(cookieParser() as unknown as RequestHandler)` in `apps/marketplace-api/src/app.ts`, with a comment explaining why | Revisit if/when this monorepo's `.npmrc` linker mode changes, or if `@types/cookie-parser` ships an update pinned to a specific major |
| 1-D11 | web/mobile | No Supplier/Affiliate/Admin dashboards, no product/category/order/wallet/task/offer/referral UI anywhere — Phase 1's own scope is home + login/register only | — | Later phases, per the spec's own priority order |
| 1-D12 | Schema | Full-catalog scope (orders, wallet, tasks/offers, commissions, payouts, referrals) is entirely unmodeled — only the Phase 1 subset (`User`/`Country`/`Currency`/`Language`/`CountryConfig`/`Category`/`Product`/`ProductImage`/`ProductVariant`/`Supplier`/`Affiliate`) exists | — | Later phases |
| 1-D13 | Country data | Only 9 countries seeded (SA, US, GB, DE, IN, PK, BR, NG, AU), not the spec's eventual 30+ country catalog | — | Grow `packages/marketplace-country/src/config/country-config-data.ts` incrementally; the engine itself is already fully data-driven, so this is pure data entry, not new code |
| 1-D14 | api | Redis-backed caching/rate-limiting mentioned as allowed in the spec was not added at all this phase (no `ioredis` dependency) — not required for Phase 1's scope and there is no live Redis in this sandbox to test degraded-mode behavior against anyway | — | Add if/when a real caching/rate-limit need appears; must degrade gracefully per the spec |

## Fixed during this build (not shipped as debt)

- A real bug, not a stub: `MarketplaceApiClient`'s default `fetchImpl` was the bare
  global `fetch` reference, which throws `Illegal invocation` in a real browser when
  invoked as `this.fetchImpl(...)` (native `fetch` requires its `this` to be
  `window`/`globalThis`). Caught only by actually loading `marketplace-web` in a
  headless browser (curl can't execute client-side JS) — fixed by binding
  (`fetch.bind(globalThis)`) in `packages/marketplace-shared/src/client/marketplace-api-client.ts`.
  Re-verified end-to-end afterward (see PHASE_1_REPORT.md).

## Security note

The CJ Dropshipping API key value pasted into chat during planning was **never used,
stored, logged, or referenced (in whole or in part) anywhere in this codebase** — not in code, not in `.env.example`, not in any doc, not in a test fixture.
It is treated as a compromised/exposed credential. `apps/marketplace-api/.env.example`
contains only an empty `CJ_API_KEY=` placeholder and the real, documented base URL
path (`CJ_API_BASE_URL=https://developers.cjdropshipping.com/api2.0/v1`) as a
placeholder value — no adapter that would actually call it exists yet (1-D3).
