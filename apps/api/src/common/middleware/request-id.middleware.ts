import { randomUUID } from 'node:crypto';
import type { NestMiddleware } from '@nestjs/common';

/**
 * Ensures every request carries an X-Request-Id and echoes it back so logs and clients
 * can correlate. Never overrides an upstream id, unless it is malformed (>128 chars).
 */
export const REQUEST_ID_HEADER = 'x-request-id';

export class RequestIdMiddleware implements NestMiddleware {
  use(req: { headers: Record<string, string | undefined> }, res: { setHeader: (k: string, v: string) => void }, next: () => void) {
    const existing = req.headers[REQUEST_ID_HEADER];
    const requestId =
      existing !== undefined && existing.length <= 128 && /^[\x21-\x7e]+$/.test(existing)
        ? existing
        : randomUUID();
    // Always reflect the resolved id back onto the request, not just when it was
    // missing — a malformed/oversized upstream id must be replaced, not kept.
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}