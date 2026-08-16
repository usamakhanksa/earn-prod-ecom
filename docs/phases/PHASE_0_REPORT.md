# Phase 0 — Foundations · Report

**Scope:** monorepo, toolchain, compose stack, API/Web/Admin/Mobile shells, shared packages,
i18n, CI, docs.

## Status: IMPLEMENTED (walk-through complete; container-dependent checks pending infra)

## What shipped
- **0.1** Turborepo + pnpm workspaces; strict TS preset (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`); root ESLint flat config (base + react hooks + jsx-a11y);
  Prettier; commitlint + Husky hooks.
- **0.2** `docker-compose.yml` — Postgres 16, Redis 7, MinIO, Mailpit with healthchecks.
- **0.3** NestJS API skeleton: zod-typed env config, Pino (`nestjs-pino`) logging with redaction,
  request-ID middleware, RFC 9457 global exception filter, `/v1/healthz` + `/v1/readyz`,
  helmet + CORS.
- **0.4** Prisma schema (identity/tenancy + catalog head + Phase 4.5 points tables), seeded demo
  tenant/users/consumer wallet/video/rule, Testcontainers-integration command wired (gated).
- **0.5/0.6** Next.js `web` + `admin` shells on the design tokens + Tailwind preset; Expo SDK 52
  mobile shell with Expo Router tabs.
- **0.7** `@omnisell/ui`: design tokens (light+dark + consumer sub-theme) and a11y-safe primitives
  (Button/Badge/Skeleton/Spinner) with tests.
- **0.8** `@omnisell/i18n`: `en.json` + `ar.json` in lockstep, RTL detection, interpolation, tests.
- **0.9** CI workflow (lint → typecheck → unit → migrate/seed → e2e → build) with Postgres/Redis
  services; axe gate (**0-D10**).
- **0.10** `docs/RUNBOOK.md` stub; Sentry/OTel wiring deferred (**0-D12**). `docs/DEBT.md`,
  `docs/OPEN_QUESTIONS.md`, `docs/API.md`, `docs/CONNECTORS.md` created.

## Verification performed in this environment
| Gate | Result |
|---|---|
| `pnpm install` (workspace) | ✅ 426 + app deps |
| unit tests (shared/i18n/ui/api-client/connectors/api/web/admin/mobile) | ✅ (see run log) |
| `tsc --noEmit` per package | ✅ (see run log) |
| `prisma validate` / `prisma generate` | ✅ (see run log) |
| `pnpm lint` (root ESLint) | ✅ (see run log) |
| `docker compose up` + `pnpm dev` | ⛔ **Docker absent in this sandbox** — verify on a Docker-enabled machine or CI |

## Stubbed / flagged (see `docs/DEBT.md`)
0-D2 containers, 0-D5 Redis/BullMQ wiring, 0-D8 connector adapters, 0-D9 OpenAPI client
generation, 0-D10 live axe scan, 0-D11 husky-after-first-commit, 0-D12 Sentry/OTel.

## Next
Phase 1 — Identity, Tenancy, RBAC, App Shell (repo base, RLS application, auth endpoints,
cross-tenant negative tests).