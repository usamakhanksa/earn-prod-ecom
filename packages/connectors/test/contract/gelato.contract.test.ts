import { describe, expect, it } from 'vitest';
import { gelatoAdapter } from '../../src/adapters/gelato';
import type { Ctx } from '../../src/types';

/** Nightly sandbox contract test — see printful.contract.test.ts's doc comment
 * for the gating rationale. Gated on `GELATO_CONTRACT_TEST_API_KEY`. */
const apiKey = process.env.GELATO_CONTRACT_TEST_API_KEY;

describe.skipIf(apiKey === undefined)('gelato — live contract', () => {
  const ctx: Ctx = { tenantId: 'contract-test', connectionId: 'contract-test', sandbox: false, accessToken: apiKey ?? '' };

  it('verifyCredentials succeeds against a real Gelato account', async () => {
    const health = await gelatoAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
  });
});

if (apiKey === undefined) {
  it.skip('GELATO_CONTRACT_TEST_API_KEY not set — nightly contract test skipped in this environment', () => {});
}
