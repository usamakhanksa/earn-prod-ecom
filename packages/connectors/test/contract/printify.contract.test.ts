import { describe, expect, it } from 'vitest';
import { printifyAdapter } from '../../src/adapters/printify';
import type { Ctx } from '../../src/types';

/** Nightly sandbox contract test — see printful.contract.test.ts's doc comment
 * for the gating rationale. Gated on `PRINTIFY_CONTRACT_TEST_TOKEN`. */
const token = process.env.PRINTIFY_CONTRACT_TEST_TOKEN;

describe.skipIf(token === undefined)('printify — live sandbox contract', () => {
  const ctx: Ctx = { tenantId: 'contract-test', connectionId: 'contract-test', sandbox: false, accessToken: token ?? '' };

  it('verifyCredentials succeeds and resolves at least one shop', async () => {
    const health = await printifyAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
  });
});

if (token === undefined) {
  it.skip('PRINTIFY_CONTRACT_TEST_TOKEN not set — nightly contract test skipped in this environment', () => {});
}
