import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { gumroadAdapter } from '../src/adapters/gumroad';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-token' };

describe('gumroadAdapter', () => {
  it('capabilities match the confirmed OAuth scope list (help.gumroad.com)', () => {
    expect(gumroadAdapter.capabilities.canAutomate).toBe(true);
    expect(gumroadAdapter.capabilities.canFulfil).toBe(true); // mark_sales_as_shipped scope
    expect(gumroadAdapter.capabilities.canFetchEarnings).toBe(false); // no confirmed payouts endpoint
  });

  it('verifyCredentials — happy path returns the account name', async () => {
    server.use(http.get('https://api.gumroad.com/v2/user', () => HttpResponse.json({ success: true, user: { name: 'Demo Creator', email: 'demo@example.com' } })));
    const health = await gumroadAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Demo Creator');
  });

  it('verifyCredentials — honest failure when Gumroad reports success: false (not an HTTP error)', async () => {
    server.use(http.get('https://api.gumroad.com/v2/user', () => HttpResponse.json({ success: false, message: 'Invalid access token' })));
    const health = await gumroadAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(false);
    expect(health.message).toBe('Invalid access token');
  });

  it('publish — happy path creates a product', async () => {
    server.use(http.post('https://api.gumroad.com/v2/products', () => HttpResponse.json({ success: true, product: { id: 'prod_1' } })));
    const result = await gumroadAdapter.publish!(ctx, {
      listingId: 'l1',
      externalBlueprintId: '',
      title: 'Digital Planner',
      description: 'desc',
      tags: ['planner'],
      images: [{ placement: 'cover', url: 'https://cdn.omnisell.test/planner.png' }],
      variants: [{ providerVariantId: 'v1', priceMinor: 900n, currency: 'USD' }],
    });
    expect(result.externalId).toBe('prod_1');
  });

  it('pullOrders — happy path maps sales to NormalisedOrder', async () => {
    server.use(
      http.get('https://api.gumroad.com/v2/sales', () =>
        HttpResponse.json({
          success: true,
          sales: [
            { id: 's1', email: 'jane@example.com', full_name: 'Jane Buyer', product_id: 'prod_1', price: 900, currency: 'usd', created_at: '2026-08-01T00:00:00Z' },
          ],
          next_page_key: null,
        }),
      ),
    );
    const page = await gumroadAdapter.pullOrders!(ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.totalMinor).toBe(900n);
    expect(page.nextCursor).toBeNull();
  });

  it('handleWebhook — parses the Ping sale payload into a NormalisedEvent', async () => {
    const events = await gumroadAdapter.handleWebhook!(ctx, { headers: {}, body: { sale_id: 's1', sale_timestamp: '2026-08-01T00:00:00Z' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.externalOrderId).toBe('s1');
  });

  it('failure mode: malformed (non-JSON) response maps to MALFORMED_RESPONSE', async () => {
    server.use(http.get('https://api.gumroad.com/v2/user', () => new HttpResponse('<html>error</html>', { status: 200 })));
    try {
      await gumroadAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      expect(gumroadAdapter.mapError(error).code).toBe('MALFORMED_RESPONSE');
    }
  });
});
