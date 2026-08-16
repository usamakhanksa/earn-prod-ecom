/**
 * Accessibility gate (Phase 0.9 CI requirement — prompt.md).
 *
 * When E2E=1 and the web app + API are running, scans key routes with @axe-core/playwright
 * and fails the run on serious/critical violations. Without those prerequisites it explains
 * how to run it and exits 0 so local `pnpm axe` stays non-blocking during development.
 *
 * The hard CI gate (fail on serious/critical) is enforced in .github/workflows/ci.yml which
 * boots containers first and sets E2E=1.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const e2e = (process.env.E2E ?? '0') === '1';
const webUrl = process.env.APP_URL ?? 'http://localhost:3000';
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

function isUp(url) {
  try {
    return execSync(
      `node -e "fetch('${url}/v1/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,
      { stdio: 'ignore', timeout: 5000 },
    ) !== undefined;
  } catch {
    return false;
  }
}

if (!e2e) {
  console.log(
    '[axe] Skipped (E2E=0). Run: docker compose up -d && pnpm db:migrate && pnpm dev, then E2E=1 pnpm axe',
  );
  process.exit(0);
}

if (!isUp(apiUrl) || !isUp(webUrl)) {
  console.error(
    `[axe] E2E=1 but services are not reachable (api=${apiUrl}, web=${webUrl}). Refusing to scan a dead stack.`,
  );
  process.exit(2);
}

try {
  // Requires devDependencies: @axe-core/playwright + playwright (CI installs them).
  const scan = await import('./axe-scan.mjs');
  const report = await scan.default({ urls: [`${webUrl}/`, `${webUrl}/en`, `${webUrl}/ar`] });
  console.log(`[axe] ${report.passes} passed, ${report.violations} serious/critical violations`);
  process.exit(report.violations > 0 ? 1 : 0);
} catch (error) {
  console.error(
    '[axe] Playwright scan unavailable. Install @axe-core/playwright + playwright (CI does) then re-run.',
  );
  console.error(String(error));
  process.exit(3);
}