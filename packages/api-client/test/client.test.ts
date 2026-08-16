import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, OmniSellClient } from '../src/client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('OmniSellClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs and parses JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    const client = new OmniSellClient({ baseUrl: 'http://api.test', fetchImpl });
    const result = await client.get<{ status: string }>('/v1/healthz');
    expect(result.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith('http://api.test/v1/healthz', expect.any(Object));
  });

  it('sends Bearer token and Idempotency-Key on POST', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { id: '1' }));
    const client = new OmniSellClient({ baseUrl: 'http://api.test', token: 'sekret', fetchImpl });
    await client.post('/v1/wallet/redeem/confirm', { pointsToUse: 100 }, 'idem-1');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer sekret');
    expect(headers.get('idempotency-key')).toBe('idem-1');
    expect(init.body).toBe('{"pointsToUse":100}');
  });

  it('parses RFC 9457 problems into ApiRequestError', async () => {
    const problem = { type: 'about:blank', title: 'Too fast', status: 429, code: 'POINTS_COOLDOWN' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(problem), {
          status: 429,
          headers: { 'content-type': 'application/problem+json', 'x-request-id': 'req-1' },
        }),
      );
    const client = new OmniSellClient({ baseUrl: 'http://api.test', fetchImpl });

    await expect(client.post('/v1/wallet/earn/video-watch', {})).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 429,
      code: 'POINTS_COOLDOWN',
      requestId: 'req-1',
    } satisfies Partial<ApiRequestError>);
  });

  it('sends x-tenant-id when an active org context is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = new OmniSellClient({ baseUrl: 'http://api.test', tenantId: 'tenant-1', fetchImpl });
    await client.get('/v1/feature-flags');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-tenant-id')).toBe('tenant-1');
  });

  it('supports patch/put/delete with Idempotency-Key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { updated: true }));
    const client = new OmniSellClient({ baseUrl: 'http://api.test', fetchImpl });
    await client.patch('/v1/members/m1', { role: 'ADMIN' }, 'idem-2');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    const headers = new Headers(init.headers);
    expect(headers.get('idempotency-key')).toBe('idem-2');
  });

  it('appends query params for GET', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], nextCursor: null }));
    const client = new OmniSellClient({ baseUrl: 'http://api.test/', fetchImpl });
    await client.get('/v1/wallet/transactions', { limit: 25, cursor: undefined });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/v1/wallet/transactions?limit=25',
      expect.any(Object),
    );
  });

  describe('streamSse — the publish pipeline view\'s SSE consumer (fetch-based, not EventSource)', () => {
    function sseResponse(frames: string[]): Response {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames) {
            controller.enqueue(new TextEncoder().encode(frame));
          }
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }

    it('parses each SSE frame into a real onEvent callback, in order', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        sseResponse([
          'event: sync-job-update\ndata: {"status":"RUNNING","completedItems":0}\n\n',
          'event: sync-job-update\ndata: {"status":"COMPLETED","completedItems":2}\n\n',
        ]),
      );
      const client = new OmniSellClient({ baseUrl: 'http://api.test', token: 'sekret', fetchImpl });
      const events: Array<{ status: string; completedItems: number }> = [];
      await new Promise<void>((resolve) => {
        client.streamSse('/v1/sync-jobs/job-1', {
          onEvent: (data: { status: string; completedItems: number }) => events.push(data),
          onDone: resolve,
        });
      });
      expect(events).toEqual([
        { status: 'RUNNING', completedItems: 0 },
        { status: 'COMPLETED', completedItems: 2 },
      ]);
    });

    it('sends the real Authorization header — something a native EventSource could not do', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse(['data: {"status":"RUNNING"}\n\n']));
      const client = new OmniSellClient({ baseUrl: 'http://api.test', token: 'sekret', fetchImpl });
      await new Promise<void>((resolve) => {
        client.streamSse('/v1/sync-jobs/job-1', { onEvent: () => {}, onDone: resolve });
      });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.get('authorization')).toBe('Bearer sekret');
      expect(headers.get('accept')).toBe('text/event-stream');
    });

    it('handles a frame split across multiple stream chunks', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse(['data: {"stat', 'us":"RUNNING"}\n\n']));
      const client = new OmniSellClient({ baseUrl: 'http://api.test', fetchImpl });
      const events: unknown[] = [];
      await new Promise<void>((resolve) => {
        client.streamSse('/v1/sync-jobs/job-1', { onEvent: (data) => events.push(data), onDone: resolve });
      });
      expect(events).toEqual([{ status: 'RUNNING' }]);
    });

    it('calls onError for a failed HTTP response instead of hanging silently', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
      const client = new OmniSellClient({ baseUrl: 'http://api.test', fetchImpl });
      const error = await new Promise((resolve) => {
        client.streamSse('/v1/sync-jobs/job-1', { onEvent: () => {}, onError: resolve });
      });
      expect(error).toBeInstanceOf(ApiRequestError);
    });

    it('stops delivering events once unsubscribed', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse(['data: {"status":"RUNNING"}\n\n']));
      const client = new OmniSellClient({ baseUrl: 'http://api.test', fetchImpl });
      const unsubscribe = client.streamSse('/v1/sync-jobs/job-1', { onEvent: () => {}, onError: () => {
        throw new Error('should not be called after unsubscribe');
      } });
      unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });
});