import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { toProblemDetails } from '@omnisell/shared';

/**
 * Global exception filter emitting RFC 9457 application/problem+json.
 *
 * The safety rule is "never leak an UNCONTROLLED error", not "never leak a 5xx".
 * A deliberately-thrown `HttpException` (or zod validation error) is always our
 * own curated message, whatever its status — including a 5xx like the OAuth
 * module's `501 oauth_provider_not_configured` (prompt.md Phase 1.3), which must
 * stay readable for the caller to act on. The one status that stays silent even
 * when it came from an `HttpException` is exactly 500: that generic code is what
 * both "an unhandled exception" and "an explicit `InternalServerErrorException`"
 * map to, and we cannot tell those apart from the caller's side, so it is treated
 * as the conservative default. Anything that is NOT an `HttpException`/`ZodError`
 * (a genuinely unhandled exception) is always masked, regardless of status.
 */
@Catch()
export class Rfc9457ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(Rfc9457ExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isZodError = exception instanceof ZodError;
    const isHttp = exception instanceof HttpException;
    const isControlled = isHttp || isZodError;
    const status = isHttp ? exception.getStatus() : isZodError ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | undefined;
    let code: string | undefined;
    let retryAfterSeconds: number | undefined;
    if (isZodError) {
      message = exception.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
    } else if (isHttp) {
      const candidate = exception.getResponse();
      const raw = typeof candidate === 'string' ? candidate : (candidate as { message?: unknown }).message;
      message = Array.isArray(raw) ? raw.join(', ') : raw === undefined ? undefined : String(raw);
      const codeCandidate = typeof candidate === 'object' && candidate !== null ? (candidate as { code?: unknown }).code : undefined;
      code = typeof codeCandidate === 'string' ? codeCandidate : undefined;
      // §7.3/§9.5 — POINTS_COOLDOWN / POINTS_DAILY_CAP_REACHED (and any future
      // 429) carry a real `Retry-After` header, not just a human-readable
      // sentence, per prompt.md's "429 with Retry-After" API convention.
      const retryCandidate = typeof candidate === 'object' && candidate !== null ? (candidate as { retryAfterSeconds?: unknown }).retryAfterSeconds : undefined;
      retryAfterSeconds = typeof retryCandidate === 'number' ? retryCandidate : undefined;
    }

    if (!isControlled) {
      this.logger.error(
        `Request failed: ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Generic 500 (unhandled OR an explicit InternalServerErrorException — the
    // two are indistinguishable from the caller's side) stays silent; any other
    // status coming from a controlled exception is safe to explain.
    const revealDetail = isControlled && status !== HttpStatus.INTERNAL_SERVER_ERROR;

    const problem = toProblemDetails({
      type: 'about:blank',
      title: revealDetail ? STATUS_CODES[status] ?? 'Error' : 'Internal server error',
      status,
      ...(revealDetail && message !== undefined ? { detail: message } : {}),
      ...(revealDetail && code !== undefined ? { code } : {}),
      instance: `${request.method} ${request.originalUrl}`,
    });
    if (revealDetail && retryAfterSeconds !== undefined) {
      (problem as { retryAfterSeconds?: number }).retryAfterSeconds = retryAfterSeconds;
    }

    const withRetryHeader = response.status(status).header('content-type', 'application/problem+json; charset=utf-8');
    if (revealDetail && retryAfterSeconds !== undefined) {
      withRetryHeader.header('Retry-After', String(retryAfterSeconds));
    }
    withRetryHeader.json(problem);
  }
}
