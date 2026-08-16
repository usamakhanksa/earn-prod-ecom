import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { sellfyAdapter } from '../src/adapters/sellfy';
import type { Ctx } from '../src/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-token', externalAccountId: 'https://demo.sellfy.store' };

describe('sellfyAdapter', () => {
  it('has NO publish/update/unpublish/pullOrders/fetchBlueprints — no confirmed REST API exists', () => {
    expect(sellfyAdapter.capabilities.canPublish).toBe(false);
    expect(sellfyAdapter.publish).toBeUndefined();
    expect(sellfyAdapter.update).toBeUndefined();
    expect(sellfyAdapter.unpublish).toBeUndefined();
    expect(sellfyAdapter.pullOrders).toBeUndefined();
    expect(sellfyAdapter.fetchBlueprints).toBeUndefined();
  });

  it('verifyCredentials is honestly NOT a credential check — it only confirms the store URL is reachable', async () => {
    server.use(
      http.get('https://sellfy.com/oembed/', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('url')).toBe('https://demo.sellfy.store');
        return HttpResponse.json({ title: 'Demo Sellfy Store', provider_name: 'Sellfy' });
      }),
    );
    const health = await sellfyAdapter.verifyCredentials(ctx);
    expect(health.ok).toBe(true);
    expect(health.message).toContain('does NOT confirm the API token');
  });

  it('verifyCredentials — honest failure when no store URL is configured', async () => {
    const noStoreCtx: Ctx = { tenantId: 't1', connectionId: 'c1', sandbox: false, accessToken: 'test-token' };
    const health = await sellfyAdapter.verifyCredentials(noStoreCtx);
    expect(health.ok).toBe(false);
  });

  it('handleWebhook — discriminates the confirmed "New order" payload shape', async () => {
    const events = await sellfyAdapter.handleWebhook!(ctx, {
      headers: {},
      body: { transaction_id: 'tx_1', amount: 1999, currency: 'USD', created_at: '2026-08-01T00:00:00Z' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('new_order');
    expect(events[0]?.externalOrderId).toBe('tx_1');
  });

  it('handleWebhook — falls back to unknown for an unrecognised payload shape rather than guessing', async () => {
    const events = await sellfyAdapter.handleWebhook!(ctx, { headers: {}, body: { some_field: 'x' } });
    expect(events[0]?.type).toBe('unknown');
  });

  it('failure mode: oEmbed 404 (store URL not found) maps to a non-retryable NOT_FOUND error', async () => {
    server.use(http.get('https://sellfy.com/oembed/', () => HttpResponse.json({ error: 'not found' }, { status: 404 })));
    try {
      await sellfyAdapter.verifyCredentials(ctx);
      expect.unreachable();
    } catch (error) {
      const mapped = sellfyAdapter.mapError(error);
      expect(mapped.code).toBe('NOT_FOUND');
    }
  });
});
