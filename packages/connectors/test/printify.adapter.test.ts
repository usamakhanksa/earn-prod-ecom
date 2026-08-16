import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { printifyAdapter } from '../src/adapters/printify';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctxWithoutShop: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-pat' };
const ctx: Ctx = { ...ctxWithoutShop, externalAccountId: '555' };

describe('printifyAdapter', () => {
  it('capabilities match api-registration.md §2.1', () => {
    expect(printifyAdapter.capabilities.canAutomate).toBe(true);
    expect(printifyAdapter.capabilities.supportsWebhooks).toBe(true);
  });

  it('verifyCredentials — lists shops and reports the first as the account label', async () => {
    server.use(
      http.get('https://api.printify.com/v1/shops.json', () =>
        HttpResponse.json([{ id: 555, title: 'Demo Printify Shop' }]),
      ),
    );
    const health = await printifyAdapter.verifyCredentials(ctxWithoutShop);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Demo Printify Shop');
  });

  it('fetchBlueprints — walks blueprint → print-provider → variants (three levels, per api-registration.md)', async () => {
    server.use(
      http.get('https://api.printify.com/v1/catalog/blueprints.json', () =>
        HttpResponse.json([{ id: 5, title: 'Mug 11oz', brand: 'Generic', model: 'Mug' }]),
      ),
      http.get('https://api.printify.com/v1/catalog/blueprints/5/print_providers.json', () =>
        HttpResponse.json([{ id: 29, title: 'Provider A' }]),
      ),
      http.get('https://api.printify.com/v1/catalog/blueprints/5/print_providers/29/variants.json', () =>
        HttpResponse.json({
          variants: [{ id: 100, title: '11oz', options: { color: 'White', size: '11oz' }, cost: 450 }],
        }),
      ),
    );
    const blueprints = await printifyAdapter.fetchBlueprints!(ctx);
    expect(blueprints).toHaveLength(1);
    expect(blueprints[0]?.variants[0]?.baseCostMinor).toBe(450n);
  });

  it('requires a resolved shop_id before calling shop-scoped endpoints', async () => {
    await expect(printifyAdapter.publish!(ctxWithoutShop, minimalPublishInput())).rejects.toThrow(/shop_id/);
  });

  it('publish — happy path posts to the shop-scoped products endpoint', async () => {
    server.use(http.post('https://api.printify.com/v1/shops/555/products.json', () => HttpResponse.json({ id: 'prod_1' })));
    const result = await printifyAdapter.publish!(ctx, minimalPublishInput());
    expect(result.externalId).toBe('prod_1');
  });

  it('failure mode: auth expired (401)', async () => {
    server.use(http.get('https://api.printify.com/v1/shops.json', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })));
    try {
      await printifyAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      expect(printifyAdapter.mapError(error).code).toBe('AUTH_EXPIRED');
    }
  });

  it('failure mode: provider 5xx maps to a retryable PROVIDER_UNAVAILABLE error', async () => {
    server.use(http.get('https://api.printify.com/v1/shops.json', () => HttpResponse.json({ error: 'oops' }, { status: 503 })));
    try {
      await printifyAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = printifyAdapter.mapError(error);
      expect(mapped.code).toBe('PROVIDER_UNAVAILABLE');
      expect(mapped.retryable).toBe(true);
    }
  });
});

function minimalPublishInput() {
  return {
    listingId: 'l1',
    externalBlueprintId: '5',
    title: 'Mug design',
    description: 'desc',
    tags: ['mug'],
    images: [{ placement: 'front', url: 'https://cdn.omnisell.test/design.png' }],
    variants: [{ providerVariantId: '100', priceMinor: 1500n, currency: 'USD' }],
  };
}
