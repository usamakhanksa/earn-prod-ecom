import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { gelatoAdapter } from '../src/adapters/gelato';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-api-key', externalAccountId: 'store_1' };

describe('gelatoAdapter', () => {
  it('capabilities match api-registration.md §2.1', () => {
    expect(gelatoAdapter.capabilities.canAutomate).toBe(true);
    expect(gelatoAdapter.capabilities.canFetchCost).toBe(true);
  });

  it('verifyCredentials — lists stores via the ecommerce subdomain', async () => {
    server.use(http.get('https://ecommerce.gelatoapis.com/v1/stores', () => HttpResponse.json([{ id: 'store_1', name: 'Demo Store' }])));
    const health = await gelatoAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Demo Store');
  });

  it('fetchBlueprints — lists catalogs then searches products per catalog', async () => {
    server.use(
      http.get('https://product.gelatoapis.com/v3/catalogs', () => HttpResponse.json([{ catalogUid: 'apparel-tshirt', title: 'T-Shirts' }])),
      http.post('https://product.gelatoapis.com/v3/products:search', () =>
        HttpResponse.json({
          products: [
            {
              productUid: 'p1',
              variants: [{ variantUid: 'v1', attributes: { size: 'M', color: 'Black' }, price: 12.5, currency: 'USD' }],
            },
          ],
        }),
      ),
    );
    const blueprints = await gelatoAdapter.fetchBlueprints!(ctx);
    expect(blueprints).toHaveLength(1);
    expect(blueprints[0]?.variants[0]?.baseCostMinor).toBe(1250n);
  });

  it('publish — happy path uses the create-from-template endpoint', async () => {
    server.use(
      http.post('https://ecommerce.gelatoapis.com/v1/stores/store_1/products:create-from-template', () => HttpResponse.json({ id: 'gp_1' })),
    );
    const result = await gelatoAdapter.publish!(ctx, {
      listingId: 'l1',
      externalBlueprintId: 'apparel-tshirt',
      title: 'Design',
      description: 'd',
      tags: [],
      images: [],
      variants: [{ providerVariantId: 'v1', priceMinor: 1999n, currency: 'USD' }],
    });
    expect(result.externalId).toBe('gp_1');
  });

  it('failure mode: auth expired (403) maps correctly', async () => {
    server.use(http.get('https://ecommerce.gelatoapis.com/v1/stores', () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 })));
    try {
      await gelatoAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      expect(gelatoAdapter.mapError(error).code).toBe('AUTH_EXPIRED');
    }
  });

  it('failure mode: validation (422) maps to a non-retryable VALIDATION error with the provider message', async () => {
    server.use(
      http.get('https://ecommerce.gelatoapis.com/v1/stores', () => HttpResponse.json({ message: 'storeId missing' }, { status: 422 })),
    );
    try {
      await gelatoAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = gelatoAdapter.mapError(error);
      expect(mapped.code).toBe('VALIDATION');
      expect(mapped.userMessage).toContain('storeId missing');
    }
  });
});
