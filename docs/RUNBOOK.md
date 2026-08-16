# OmniSell — Runbook (stub)

## Cycling the stack
```bash
docker compose up -d            # postgres · redis · minio · mailpit
pnpm install
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev                        # api :4000 · web :3000 · admin :3001 · expo :8081
```

## Health
- `GET http://localhost:4000/v1/healthz` — liveness
- `GET http://localhost:4000/v1/readyz` — readiness (`checks.database` etc.)

## Verification gates (per phase)
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```
`test:e2e` and the axe gate additionally need the Postgres/Redis services and `E2E=1`.

## Incident notes
- **DB down at boot:** the API stays up and reports `database: down` on `/v1/readyz`; the phase
  gate and all writes fail closed. Restart containers then run migrations.
- **Wallet reconciliation alert:** a balance that does not equal the validated-transaction sum
  pages on-call (Phase 4.5); never "correct" silently.
- **Mockup compose returns `503 object_storage_unreachable` (Phase 2):** expected whenever MinIO/S3
  is unreachable — the compositing math itself is fine (unit-tested), only the object-storage
  fetch/store around it failed. Check `S3_ENDPOINT`/MinIO health before assuming a code bug.
- **Resumable-upload scratch directory (`ASSET_UPLOAD_SCRATCH_DIR`, Phase 2) grows unbounded:**
  it is a disk-backed stand-in for S3 multipart storage (docs/DEBT.md 2-D2) — completed/aborted
  sessions clean up their own `.part` file, but a crashed process mid-upload can leave one behind.
  Safe to periodically purge files older than `AssetUploadSession.expiresAt` (1 hour by default).

_Expand with per-module operational procedures as phases land._