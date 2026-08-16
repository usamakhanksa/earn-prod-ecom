import { describe, expect, it } from 'vitest';
import { prodigiAdapter } from '../../src/adapters/prodigi';
import type { Ctx } from '../../src/types';

/** Nightly sandbox contract test — see printful.contract.test.ts's doc comment
 * for the gating rationale. Gated on `PRODIGI_SANDBOX_API_KEY` (api-registration.md
 * notes Prodigi's sandbox is "genuinely usable" — this is the one adapter where
 * a real nightly run is expected to be cheapest to set up once a key exists). */
const apiKey = process.env.PRODIGI_SANDBOX_API_KEY;

describe.skipIf(apiKey === undefined)('prodigi — live sandbox contract', () => {
  const ctx: Ctx = { tenantId: 'contract-test', connectionId: 'contract-test', sandbox: true, accessToken: apiKey ?? '' };

  it('verifyCredentials succeeds against the real Prodigi sandbox', async () => {
    const health = await prodigiAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
  });
});

if (apiKey === undefined) {
  it.skip('PRODIGI_SANDBOX_API_KEY not set — nightly contract test skipped in this environment', () => {});
}
