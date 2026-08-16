import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { prodigiAdapter } from '../src/adapters/prodigi';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sandboxCtx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: true, accessToken: 'test-sandbox-key' };

describe('prodigiAdapter', () => {
  it('has NO publish/update/unpublish methods — Prodigi has no documented storefront-listing API', () => {
    expect(prodigiAdapter.capabilities.canPublish).toBe(false);
    expect(prodigiAdapter.publish).toBeUndefined();
    expect(prodigiAdapter.update).toBeUndefined();
    expect(prodigiAdapter.unpublish).toBeUndefined();
  });

  it('still automates fulfilment/orders/costs — canAutomate is true despite the publish gap', () => {
    expect(prodigiAdapter.capabilities.canAutomate).toBe(true);
    expect(prodigiAdapter.capabilities.canFulfil).toBe(true);
    expect(prodigiAdapter.capabilities.supportsSandbox).toBe(true);
  });

  it('verifyCredentials — uses the sandbox base URL when ctx.sandbox is true', async () => {
    server.use(http.get('https://api.sandbox.prodigi.com/v4.0/Orders', () => HttpResponse.json({ orders: [] })));
    const health = await prodigiAdapter.verifyCredentials(sandboxCtx);
    expect(health.ok).toBe(true);
    expect(health.accountLabel).toBe('Prodigi (sandbox)');
  });

  it('verifyCredentials — uses the live base URL when ctx.sandbox is false', async () => {
    server.use(http.get('https://api.prodigi.com/v4.0/Orders', () => HttpResponse.json({ orders: [] })));
    const health = await prodigiAdapter.verifyCredentials({ ...sandboxCtx, sandbox: false });
    expect(health.accountLabel).toBe('Prodigi (live)');
  });

  it('fetchBlueprints — syncs a caller-supplied SKU seed list (no bulk catalog endpoint confirmed)', async () => {
    server.use(
      http.get('https://api.sandbox.prodigi.com/v4.0/Products/GLOBAL-CFPM-16X20', () =>
        HttpResponse.json({ sku: 'GLOBAL-CFPM-16X20', description: 'Framed Poster 16x20', productDimensions: { width: 16, height: 20, units: 'in' } }),
      ),
    );
    const blueprints = await prodigiAdapter.fetchBlueprints!({ ...sandboxCtx, externalAccountId: 'GLOBAL-CFPM-16X20' });
    expect(blueprints).toHaveLength(1);
    expect(blueprints[0]?.name).toBe('Framed Poster 16x20');
  });

  it('submitFulfilment — happy path posts an order', async () => {
    server.use(
      http.post('https://api.sandbox.prodigi.com/v4.0/Orders', () =>
        HttpResponse.json({ order: { id: 'ord_1', status: { stage: 'InProgress' }, shipments: [] } }),
      ),
    );
    const fulfilment = await prodigiAdapter.submitFulfilment!(sandboxCtx, { externalOrderId: 'merchant-ref-1' });
    expect(fulfilment.externalFulfilmentId).toBe('ord_1');
    expect(fulfilment.status).toBe('InProgress');
  });

  it('failure mode: auth expired (401) with the sandbox key', async () => {
    server.use(http.get('https://api.sandbox.prodigi.com/v4.0/Orders', () => HttpResponse.json({ message: 'Invalid API key' }, { status: 401 })));
    try {
      await prodigiAdapter.verifyCredentials(sandboxCtx);
      expect.unreachable();
    } catch (error) {
      const mapped = prodigiAdapter.mapError(error);
      expect(mapped.code).toBe('AUTH_EXPIRED');
      expect(mapped.docsHint).toContain('prodigi.com');
    }
  });

  it('failure mode: malformed response is surfaced as MALFORMED_RESPONSE, not a silent success', async () => {
    server.use(http.get('https://api.sandbox.prodigi.com/v4.0/Orders', () => new HttpResponse('not-json', { status: 200 })));
    try {
      await prodigiAdapter.verifyCredentials(sandboxCtx);
      expect.unreachable();
    } catch (error) {
      expect(prodigiAdapter.mapError(error).code).toBe('MALFORMED_RESPONSE');
    }
  });
});
