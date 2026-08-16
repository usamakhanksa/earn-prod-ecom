import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { etsyAdapter } from '../src/adapters/etsy';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-token', externalAccountId: '12345' };

describe('etsyAdapter', () => {
  it('capabilities match api-registration.md §2.2 — marketplace, not a print-catalog provider', () => {
    expect(etsyAdapter.capabilities.canAutomate).toBe(true);
    expect(etsyAdapter.capabilities.canFetchCost).toBe(false);
    expect(etsyAdapter.capabilities.supportsWebhooks).toBe(false);
    expect(etsyAdapter.fetchBlueprints).toBeUndefined();
  });

  it('buildAuthUrl — requires PKCE code_verifier and derives an S256 challenge', () => {
    const url = etsyAdapter.buildAuthUrl!({
      tenantId: 't1',
      connectionId: 'c1',
      redirectUri: 'https://app.omnisell.test/oauth/callback/etsy',
      state: 'state123',
      codeVerifier: 'a'.repeat(43),
    });
    expect(url).toContain('https://www.etsy.com/oauth/connect?');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('code_challenge=');
  });

  it('buildAuthUrl — throws without a code_verifier (PKCE is mandatory)', () => {
    expect(() =>
      etsyAdapter.buildAuthUrl!({ tenantId: 't1', connectionId: 'c1', redirectUri: 'https://x.test', state: 's' }),
    ).toThrow();
  });

  it('verifyCredentials — happy path returns the shop name', async () => {
    server.use(
      http.get('https://openapi.etsy.com/v3/application/shops/12345', () =>
        HttpResponse.json({ shop_id: 12345, shop_name: 'Demo Craft Shop' }),
      ),
    );
    const health = await etsyAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Demo Craft Shop');
  });

  it('publish — happy path creates a draft listing', async () => {
    server.use(
      http.post('https://openapi.etsy.com/v3/application/shops/12345/listings', () => HttpResponse.json({ listing_id: 555 })),
    );
    const result = await etsyAdapter.publish!(ctx, {
      listingId: 'l1',
      externalBlueprintId: '',
      title: 'Hand-painted Mug',
      description: 'desc',
      tags: ['mug', 'ceramic'],
      images: [{ placement: 'front', url: 'https://cdn.omnisell.test/mug.png' }],
      variants: [{ providerVariantId: 'v1', priceMinor: 2500n, currency: 'USD' }],
    });
    expect(result.externalId).toBe('555');
  });

  it('pullOrders — happy path maps receipts to NormalisedOrder', async () => {
    server.use(
      http.get('https://openapi.etsy.com/v3/application/shops/12345/receipts', () =>
        HttpResponse.json({
          count: 1,
          results: [
            {
              receipt_id: 999,
              status: 'paid',
              name: 'Jane Buyer',
              buyer_email: 'jane@example.com',
              grandtotal: { amount: 2500, divisor: 100, currency_code: 'USD' },
              transactions: [{ listing_id: 555, quantity: 1, price: { amount: 2500, divisor: 100 } }],
              created_timestamp: 1700000000,
            },
          ],
        }),
      ),
    );
    const page = await etsyAdapter.pullOrders!(ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.totalMinor).toBe(2500n);
    expect(page.nextCursor).toBeNull();
  });

  it('failure mode: auth expired (401) maps to a non-retryable AUTH_EXPIRED error', async () => {
    server.use(http.get('https://openapi.etsy.com/v3/application/shops/12345', () => HttpResponse.json({ error: 'invalid_token' }, { status: 401 })));
    try {
      await etsyAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = etsyAdapter.mapError(error);
      expect(mapped.code).toBe('AUTH_EXPIRED');
      expect(mapped.retryable).toBe(false);
    }
  });

  it('failure mode: rate limited (429) maps to a retryable RATE_LIMITED error', async () => {
    server.use(http.get('https://openapi.etsy.com/v3/application/shops/12345', () => HttpResponse.json({ error: 'Too Many Requests' }, { status: 429 })));
    try {
      await etsyAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = etsyAdapter.mapError(error);
      expect(mapped.code).toBe('RATE_LIMITED');
      expect(mapped.retryable).toBe(true);
    }
  });
});
