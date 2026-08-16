import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { payhipAdapter } from '../src/adapters/payhip';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-api-key' };

describe('payhipAdapter', () => {
  it('has NO publish/update/unpublish/pullOrders — Payhip\'s public API has no product/order endpoints', () => {
    expect(payhipAdapter.capabilities.canPublish).toBe(false);
    expect(payhipAdapter.capabilities.canSyncOrders).toBe(false);
    expect(payhipAdapter.publish).toBeUndefined();
    expect(payhipAdapter.update).toBeUndefined();
    expect(payhipAdapter.unpublish).toBeUndefined();
    expect(payhipAdapter.pullOrders).toBeUndefined();
    expect(payhipAdapter.fetchBlueprints).toBeUndefined();
  });

  it('still automates real coupon management — canAutomate is true despite the publish/orders gap', () => {
    expect(payhipAdapter.capabilities.canAutomate).toBe(true);
    expect(payhipAdapter.capabilities.supportsWebhooks).toBe(true);
  });

  it('verifyCredentials — happy path lists coupons via the payhip-api-key header', async () => {
    server.use(
      http.get('https://payhip.com/api/v2/coupons', ({ request }) => {
        expect(request.headers.get('payhip-api-key')).toBe('test-api-key');
        return HttpResponse.json([{ id: 'c1' }, { id: 'c2' }]);
      }),
    );
    const health = await payhipAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.message).toContain('2 coupon(s)');
  });

  it('handleWebhook — parses the confirmed "paid" event payload into a NormalisedEvent', async () => {
    const events = await payhipAdapter.handleWebhook!(ctx, {
      headers: {},
      body: { id: 'ZGjVj5x4GN', type: 'paid', email: 'jane@example.com', price: 900, currency: 'USD', date: 1700000000 },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('paid');
    expect(events[0]?.externalOrderId).toBe('ZGjVj5x4GN');
  });

  it('failure mode: auth expired (401/403) maps to a non-retryable AUTH_EXPIRED error', async () => {
    server.use(http.get('https://payhip.com/api/v2/coupons', () => HttpResponse.json({ message: 'Invalid API key' }, { status: 403 })));
    try {
      await payhipAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = payhipAdapter.mapError(error);
      expect(mapped.code).toBe('AUTH_EXPIRED');
      expect(mapped.retryable).toBe(false);
    }
  });
});
