import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { shopifyAdapter } from '../src/adapters/shopify';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const GRAPHQL_URL = 'https://demo-store.myshopify.com/admin/api/2026-07/graphql.json';
const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'shpat_test', externalAccountId: 'demo-store.myshopify.com' };

describe('shopifyAdapter', () => {
  it('capabilities: custom-app access token path, no OAuth methods on this adapter', () => {
    expect(shopifyAdapter.capabilities.canAutomate).toBe(true);
    expect(shopifyAdapter.capabilities.supportsWebhooks).toBe(true);
    expect(shopifyAdapter.buildAuthUrl).toBeUndefined();
    expect(shopifyAdapter.exchangeCode).toBeUndefined();
  });

  it('verifyCredentials — happy path returns the shop name via GraphQL', async () => {
    server.use(
      http.post(GRAPHQL_URL, () => HttpResponse.json({ data: { shop: { name: 'Demo Store', myshopifyDomain: 'demo-store.myshopify.com' } } })),
    );
    const health = await shopifyAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Demo Store');
  });

  it('publish — happy path calls productCreate and returns the new product gid', async () => {
    server.use(
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({ data: { productCreate: { product: { id: 'gid://shopify/Product/1' }, userErrors: [] } } }),
      ),
    );
    const result = await shopifyAdapter.publish!(ctx, {
      listingId: 'l1',
      externalBlueprintId: '',
      title: 'Cool Tee',
      description: 'desc',
      tags: ['tee'],
      images: [{ placement: 'front', url: 'https://cdn.omnisell.test/tee.png' }],
      variants: [{ providerVariantId: 'v1', priceMinor: 2999n, currency: 'USD' }],
    });
    expect(result.externalId).toBe('gid://shopify/Product/1');
  });

  it('publish — surfaces userErrors as a thrown Error rather than a fake success', async () => {
    server.use(
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({ data: { productCreate: { product: null, userErrors: [{ message: 'Title cannot be blank' }] } } }),
      ),
    );
    await expect(
      shopifyAdapter.publish!(ctx, {
        listingId: 'l1',
        externalBlueprintId: '',
        title: '',
        description: '',
        tags: [],
        images: [],
        variants: [],
      }),
    ).rejects.toThrow('Title cannot be blank');
  });

  it('pullOrders — happy path maps GraphQL edges to NormalisedOrder', async () => {
    server.use(
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({
          data: {
            orders: {
              edges: [
                {
                  cursor: 'c1',
                  node: {
                    id: 'gid://shopify/Order/1',
                    displayFinancialStatus: 'PAID',
                    customer: { displayName: 'Jane Buyer', email: 'jane@example.com' },
                    currentTotalPriceSet: { shopMoney: { amount: '29.99', currencyCode: 'USD' } },
                    lineItems: { edges: [{ node: { variant: { id: 'gid://shopify/ProductVariant/1' }, quantity: 1, originalUnitPriceSet: { shopMoney: { amount: '29.99' } } } }] },
                    createdAt: '2026-08-01T00:00:00Z',
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
      ),
    );
    const page = await shopifyAdapter.pullOrders!(ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.totalMinor).toBe(2999n);
    expect(page.nextCursor).toBeNull();
  });

  it('failure mode: auth expired (401) maps to a non-retryable AUTH_EXPIRED error', async () => {
    server.use(http.post(GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: 'Unauthorized' }] }, { status: 401 })));
    try {
      await shopifyAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = shopifyAdapter.mapError(error);
      expect(mapped.code).toBe('AUTH_EXPIRED');
    }
  });
});
