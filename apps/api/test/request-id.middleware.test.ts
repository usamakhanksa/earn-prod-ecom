import { describe, expect, it, vi } from 'vitest';
import { REQUEST_ID_HEADER, RequestIdMiddleware } from '../src/common/middleware/request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('assigns and echoes a request id when none is provided', () => {
    const headers: Record<string, string | undefined> = {};
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    new RequestIdMiddleware().use(
      { headers } as never,
      res as never,
      next,
    );

    const assigned = headers[REQUEST_ID_HEADER];
    expect(assigned).toBeTruthy();
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, assigned);
    expect(next).toHaveBeenCalled();
  });

  it('preserves an upstream request id', () => {
    const headers: Record<string, string | undefined> = { [REQUEST_ID_HEADER]: 'upstream-123' };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    new RequestIdMiddleware().use({ headers } as never, res as never, next);

    expect(headers[REQUEST_ID_HEADER]).toBe('upstream-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'upstream-123');
  });

  it('rejects malformed or oversized upstream ids', () => {
    const headers: Record<string, string | undefined> = {
      [REQUEST_ID_HEADER]: 'x'.repeat(200),
    };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    new RequestIdMiddleware().use({ headers } as never, res as never, next);

    expect(headers[REQUEST_ID_HEADER]).toBeTruthy();
    expect(headers[REQUEST_ID_HEADER]).not.toBe('x'.repeat(200));
    expect(next).toHaveBeenCalled();
  });
});