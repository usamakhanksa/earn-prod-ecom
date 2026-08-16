import { describe, expect, it } from 'vitest';
import { printfulAdapter } from '../../src/adapters/printful';
import type { Ctx } from '../../src/types';

/**
 * Nightly sandbox contract test (prompt.md Connector SDK: "a nightly contract
 * test against the provider sandbox, skipped in PR CI, required in nightly").
 *
 * Gated behind a REAL credential env var — `PRINTFUL_CONTRACT_TEST_TOKEN`.
 * No such credential exists in this sandbox (docs/DEBT.md), so this suite
 * skips cleanly here and everywhere else until CI's nightly job injects a
 * real Printful private token for a disposable test store. It is real,
 * runnable code — not a placeholder — the moment that secret exists.
 */
const token = process.env.PRINTFUL_CONTRACT_TEST_TOKEN;

describe.skipIf(token === undefined)('printful — live sandbox contract', () => {
  const ctx: Ctx = { tenantId: 'contract-test', connectionId: 'contract-test', sandbox: false, accessToken: token ?? '' };

  it('verifyCredentials succeeds against a real Printful account', async () => {
    const health = await printfulAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
  });

  it('fetchBlueprints returns at least one real catalog product', async () => {
    const blueprints = await printfulAdapter.fetchBlueprints!(ctx);
    expect(blueprints.length).toBeGreaterThan(0);
  });
});

if (token === undefined) {
  // Not a real test — makes the honest "why did nothing run" reason visible
  // in CI output instead of a silent empty suite.
  it.skip('PRINTFUL_CONTRACT_TEST_TOKEN not set — nightly contract test skipped in this environment', () => {});
}
