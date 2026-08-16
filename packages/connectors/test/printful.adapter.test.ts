import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { printfulAdapter } from '../src/adapters/printful';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-token' };

describe('printfulAdapter', () => {
  it('capabilities match the real, live-confirmed API surface (docs/CONNECTORS.md)', () => {
    expect(printfulAdapter.capabilities.canAutomate).toBe(true);
    expect(printfulAdapter.capabilities.supportsWebhooks).toBe(true);
    expect(printfulAdapter.capabilities.canFetchEarnings).toBe(false); // fulfilment provider, not a marketplace
  });

  it('verifyCredentials — happy path returns the store name', async () => {
    server.use(
      http.get('https://api.printful.com/store', () =>
        HttpResponse.json({ code: 200, result: { id: 1, name: 'Demo Studio Store' } }),
      ),
    );
    const health = await printfulAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Demo Studio Store');
  });

  it('fetchBlueprints — happy path maps catalog + variants into Blueprint rows', async () => {
    server.use(
      http.get('https://api.printful.com/products', () =>
        HttpResponse.json({ code: 200, result: [{ id: 71, title: 'Unisex T-Shirt', type: 'T-SHIRT' }] }),
      ),
      http.get('https://api.printful.com/products/71', () =>
        HttpResponse.json({
          code: 200,
          result: {
            product: { id: 71, title: 'Unisex T-Shirt', type: 'T-SHIRT' },
            variants: [
              { id: 4011, name: 'S / Black', size: 'S', color: 'Black', color_code: '#000000', price: '10.95' },
              { id: 4012, name: 'M / Black', size: 'M', color: 'Black', color_code: '#000000', price: '10.95' },
            ],
          },
        }),
      ),
    );
    const blueprints = await printfulAdapter.fetchBlueprints!(ctx);
    expect(blueprints).toHaveLength(1);
    expect(blueprints[0]?.variants).toHaveLength(2);
    expect(blueprints[0]?.variants[0]?.baseCostMinor).toBe(1095n);
  });

  it('publish — happy path returns the created sync product id', async () => {
    server.use(
      http.post('https://api.printful.com/store/products', () => HttpResponse.json({ code: 200, result: { id: 999 } })),
    );
    const result = await printfulAdapter.publish!(ctx, {
      listingId: 'l1',
      externalBlueprintId: '71',
      title: 'My Design Tee',
      description: 'desc',
      tags: ['tee'],
      images: [{ placement: 'front', url: 'https://cdn.omnisell.test/design.png' }],
      variants: [{ providerVariantId: '4011', priceMinor: 2500n, currency: 'USD' }],
    });
    expect(result.externalId).toBe('999');
  });

  it('buildPublishPayload — Phase 4 dry-run seam produces the exact body publish() sends over the wire', async () => {
    const input = {
      listingId: 'l1',
      externalBlueprintId: '71',
      title: 'My Design Tee',
      description: 'desc',
      tags: ['tee'],
      images: [{ placement: 'front', url: 'https://cdn.omnisell.test/design.png' }],
      variants: [{ providerVariantId: '4011', priceMinor: 2500n, currency: 'USD' }],
    };
    let capturedBody: unknown = null;
    server.use(
      http.post('https://api.printful.com/store/products', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ code: 200, result: { id: 999 } });
      }),
    );
    await printfulAdapter.publish!(ctx, input);
    const previewed = printfulAdapter.buildPublishPayload!(ctx, input);
    // The dry-run preview must be byte-for-byte what actually went over the
    // wire — not a re-implementation that could silently drift from it
    // (featureslist.md 5.5 / implentationplanphase.md task 4.4).
    expect(JSON.parse(JSON.stringify(previewed))).toEqual(capturedBody);
  });

  it('failure mode: auth expired (401) maps to a non-retryable AUTH_EXPIRED error', async () => {
    server.use(http.get('https://api.printful.com/store', () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })));
    await expect(printfulAdapter.verifyCredentials(ctx)).rejects.toThrow();
    try {
      await printfulAdapter.verifyCredentials(ctx);
    } catch (error) {
      const mapped = printfulAdapter.mapError(error);
      expect(mapped.code).toBe('AUTH_EXPIRED');
      expect(mapped.retryable).toBe(false);
    }
  });

  it('failure mode: rate limited (429) maps to a retryable RATE_LIMITED error', async () => {
    server.use(http.get('https://api.printful.com/store', () => HttpResponse.json({ error: 'Too Many Requests' }, { status: 429 })));
    try {
      await printfulAdapter.verifyCredentials(ctx);
      expect.unreachable('expected a rejection');
    } catch (error) {
      const mapped = printfulAdapter.mapError(error);
      expect(mapped.code).toBe('RATE_LIMITED');
      expect(mapped.retryable).toBe(true);
    }
  });

  it('failure mode: malformed (non-JSON) response maps to MALFORMED_RESPONSE', async () => {
    server.use(http.get('https://api.printful.com/store', () => new HttpResponse('<html>not json</html>', { status: 200 })));
    try {
      await printfulAdapter.verifyCredentials(ctx);
      expect.unreachable('expected a rejection');
    } catch (error) {
      const mapped = printfulAdapter.mapError(error);
      expect(mapped.code).toBe('MALFORMED_RESPONSE');
    }
  });
});
