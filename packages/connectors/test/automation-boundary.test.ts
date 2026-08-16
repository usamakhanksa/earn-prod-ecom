import { describe, expect, expectTypeOf, it } from 'vitest';
import { canAutomate, isAutomatable, publish, type AutomatableConnector, type Connector, type ConnectorAdapter } from '../src/adapter';
import type { Ctx, PublishInput } from '../src/types';

/**
 * THE canonical compile-time proof for prompt.md constraint #1 / the Phase 3 gate
 * ("the AutomatableConnector type constraint must compile-block Tier C automation
 * before any Tier C connector row exists").
 *
 * Fixes docs/DEBT.md 1-D18 (pre-existing bug, reproduced through Phase 1/2):
 *  1. The old `tierCBase.capabilities` literal (`{ canAutomate: false }`) did not
 *     satisfy the full `ConnectorCapabilities` interface, so the file failed
 *     `tsc` outright rather than proving anything about the boundary.
 *  2. The old test executed `publish(evil, ...)` unguarded after a
 *     `@ts-expect-error` comment — `@ts-expect-error` only suppresses the
 *     compiler error on that line, it does not stop the line from *running*,
 *     so the call still threw at runtime and failed the test with an uncaught
 *     exception instead of asserting anything.
 * Both are fixed below: a fully-populated `ConnectorCapabilities` object, and
 * the runtime call wrapped in `expect(() => ...).toThrow()`.
 */

const tierCBase = {
  id: 'c1',
  slug: 'redbubble',
  tier: 'C' as const,
  apiDocsUrl: null,
  tosUrl: 'https://www.redbubble.com/terms',
};

const noopAdapter: ConnectorAdapter = {
  slug: 'redbubble',
  capabilities: {
    canAutomate: false,
    canPublish: false,
    canUpdate: false,
    canUnpublish: false,
    canSyncOrders: false,
    canFulfil: false,
    canFetchCost: false,
    canFetchEarnings: false,
    supportsWebhooks: false,
    supportsSandbox: false,
    ordersMechanism: 'none',
  },
  async verifyCredentials() {
    throw new Error('not applicable — Tier C has no credentials to verify');
  },
  mapError() {
    return { code: 'UNKNOWN', retryable: false, userMessage: 'not applicable', docsHint: null, httpStatus: null };
  },
};

const ctx: Ctx = { tenantId: 't1', connectionId: 'conn1', sandbox: false };
const input: PublishInput = { listingId: 'l1', externalBlueprintId: 'b1', title: 't', description: 'd', tags: [], images: [], variants: [] };

describe('Tier C automation boundary', () => {
  it('is a TYPE-LEVEL guarantee: a Tier C connector can never be typed as AutomatableConnector', () => {
    const evil = {
      ...tierCBase,
      capabilities: {
        canAutomate: false,
        canPublish: false,
        canUpdate: false,
        canUnpublish: false,
        canSyncOrders: false,
        canFulfil: false,
        canFetchCost: false,
        canFetchEarnings: false,
        supportsWebhooks: false,
        supportsSandbox: false,
        ordersMechanism: 'none' as const,
      },
    } satisfies Connector;

    expect(canAutomate(evil)).toBe(false);
    expect(isAutomatable(evil, noopAdapter)).toBe(false);
    // Compile-time proof that `evil` is not an AutomatableConnector:
    expectTypeOf(evil).not.toMatchTypeOf<AutomatableConnector>();

    // Runtime tripwire proof: even if a caller lied to the compiler, the
    // function body itself refuses. This line intentionally lies with `as`
    // to exercise the tripwire — this is the ONE place in the whole codebase
    // that is allowed to, because it is the test proving the tripwire fires,
    // not a production call site.
    expect(() => publish(evil as unknown as AutomatableConnector, noopAdapter, ctx, input)).toThrow(/Refusing to automate/);

    // The real, everyday proof: a Tier C connector cannot be passed to
    // publish() at all without lying to the compiler first, unlike the cast
    // above. The `@ts-expect-error` directive just below is the assertion —
    // if a future edit ever widened `publish`'s signature enough to accept
    // `evil` here for real, this whole test file would fail to compile
    // ("Unused '@ts-expect-error' directive"), which is exactly the alarm we want.
    void ((): void => {
      // @ts-expect-error tier C's `evil` is not an AutomatableConnector
      publish(evil, noopAdapter, ctx, input);
    });
  });

  it('accepts connectors that are type-valid automatables', () => {
    const valid = {
      id: 'a1',
      slug: 'printful',
      tier: 'A' as const,
      apiDocsUrl: 'https://developers.printful.com/docs/',
      tosUrl: 'https://www.printful.com/policies/terms-of-service',
      capabilities: {
        canAutomate: true,
        canPublish: true,
        canUpdate: true,
        canUnpublish: true,
        canSyncOrders: true,
        canFulfil: true,
        canFetchCost: true,
        canFetchEarnings: false,
        supportsWebhooks: true,
        supportsSandbox: false,
        ordersMechanism: 'webhook' as const,
      },
    } satisfies AutomatableConnector;

    expect(canAutomate(valid)).toBe(true);
    expectTypeOf(valid).toMatchTypeOf<AutomatableConnector>();
  });
});
