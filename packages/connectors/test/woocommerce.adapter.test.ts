import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { woocommerceAdapter } from '../src/adapters/woocommerce';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = {
  tenantId: 't1',
  connectionId: 'c1',
  sandbox: false,
  accessToken: 'ck_test',
  secondaryToken: 'cs_test',
  externalAccountId: 'https://mystore.example.com',
};

describe('woocommerceAdapter', () => {
  it('capabilities: HTTPS-only Basic Auth, no fulfilment/earnings concept in core REST', () => {
    expect(woocommerceAdapter.capabilities.canAutomate).toBe(true);
    expect(woocommerceAdapter.capabilities.canFulfil).toBe(false);
    expect(woocommerceAdapter.capabilities.canFetchEarnings).toBe(false);
  });

  it('refuses a plain-HTTP store URL rather than silently downgrading auth', async () => {
    const httpCtx: Ctx = { ...ctx, externalAccountId: 'http://mystore.example.com' };
    await expect(woocommerceAdapter.verifyCredentials(httpCtx)).rejects.toThrow(/HTTPS/i);
  });

  it('verifyCredentials — happy path lists a sample product over Basic Auth', async () => {
    server.use(
      http.get('https://mystore.example.com/wp-json/wc/v3/products', ({ request }) => {
        expect(request.headers.get('authorization')).toBe(`Basic ${Buffer.from('ck_test:cs_test').toString('base64')}`);
        return HttpResponse.json([{ id: 1, name: 'Ceramic Mug' }]);
      }),
    );
    const health = await woocommerceAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.message).toContain('Ceramic Mug');
  });

  it('publish — happy path creates a product', async () => {
    server.use(http.post('https://mystore.example.com/wp-json/wc/v3/products', () => HttpResponse.json({ id: 42 })));
    const result = await woocommerceAdapter.publish!(ctx, {
      listingId: 'l1',
      externalBlueprintId: '',
      title: 'Ceramic Mug',
      description: 'desc',
      tags: ['mug'],
      images: [{ placement: 'front', url: 'https://cdn.omnisell.test/mug.png' }],
      variants: [{ providerVariantId: 'v1', priceMinor: 1999n, currency: 'USD' }],
    });
    expect(result.externalId).toBe('42');
  });

  it('pullOrders — happy path maps WooCommerce orders to NormalisedOrder', async () => {
    server.use(
      http.get('https://mystore.example.com/wp-json/wc/v3/orders', () =>
        HttpResponse.json([
          {
            id: 7,
            status: 'processing',
            billing: { first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com' },
            currency: 'USD',
            total: '19.99',
            line_items: [{ product_id: 42, quantity: 1, total: '19.99' }],
            date_created: '2026-08-01T00:00:00',
          },
        ]),
      ),
    );
    const page = await woocommerceAdapter.pullOrders!(ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.totalMinor).toBe(1999n);
    expect(page.items[0]?.buyerName).toBe('Jane Buyer');
  });

  it('failure mode: conflict (409) maps to a non-retryable CONFLICT error', async () => {
    server.use(http.get('https://mystore.example.com/wp-json/wc/v3/products', () => HttpResponse.json({ message: 'Duplicate SKU' }, { status: 409 })));
    try {
      await woocommerceAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = woocommerceAdapter.mapError(error);
      expect(mapped.code).toBe('CONFLICT');
      expect(mapped.userMessage).toContain('Duplicate SKU');
    }
  });
});
