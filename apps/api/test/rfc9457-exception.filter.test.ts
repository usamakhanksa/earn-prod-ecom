import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Rfc9457ExceptionFilter } from '../src/common/filters/rfc9457-exception.filter';

function createHost(): ArgumentsHost {
  const response = {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const request = { method: 'GET', originalUrl: '/v1/healthz' };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('Rfc9457ExceptionFilter', () => {
  it('maps a 4xx HttpException to application/problem+json without internal detail leaks', () => {
    const filter = new Rfc9457ExceptionFilter();
    const host = createHost();
    const exception = new BadRequestException({ message: ['field is required'] });

    filter.catch(exception, host);

    const res = host.switchToHttp().getResponse() as {
      status: ReturnType<typeof vi.fn>;
      header: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.header).toHaveBeenCalledWith('content-type', 'application/problem+json; charset=utf-8');

    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.status).toBe(400);
    expect(body.type).toBe('about:blank');
    expect(body.instance).toBe('GET /v1/healthz');
    expect(body.detail).toBe('field is required');
  });

  it('reveals detail + a machine-readable code for a deliberate non-500 5xx (e.g. OAuth 501)', () => {
    const filter = new Rfc9457ExceptionFilter();
    const host = createHost();
    const exception = new HttpException(
      { message: "OAuth provider 'GOOGLE' is not configured.", code: 'oauth_provider_not_configured' },
      501,
    );

    filter.catch(exception, host);

    const res = host.switchToHttp().getResponse() as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
    expect(res.status).toHaveBeenCalledWith(501);
    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.detail).toBe("OAuth provider 'GOOGLE' is not configured.");
    expect(body.code).toBe('oauth_provider_not_configured');
  });

  it('still masks a generic 500 HttpException — indistinguishable from an unhandled error', () => {
    const filter = new Rfc9457ExceptionFilter();
    const host = createHost();
    filter.catch(new HttpException('some internal detail', 500), host);

    const res = host.switchToHttp().getResponse() as { json: ReturnType<typeof vi.fn> };
    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.detail).toBeUndefined();
    expect(body.code).toBeUndefined();
  });

  it('masks unknown errors as a 500 without echoing the message', () => {
    const filter = new Rfc9457ExceptionFilter();
    const host = createHost();
    filter.catch(new Error('database credentials in config: postgres://user:supersecret@...'), host);

    const res = host.switchToHttp().getResponse() as {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.detail).toBeUndefined();
    expect(String(body.title)).toContain('Internal server error');
  });
});