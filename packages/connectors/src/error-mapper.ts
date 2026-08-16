import type { ConnectorError } from './types';

/**
 * Generic HTTP → `ConnectorError` mapping shared by every adapter's `mapError`
 * (prompt.md Connector SDK). Each adapter still owns its own `mapError` so it
 * can special-case a provider's specific error body shape, but the fallback
 * status-code table lives here once instead of copy-pasted four times
 * (implentationplanphase.md task 3.4 — "error mapper").
 */
export function mapHttpStatusToError(params: {
  status: number;
  slug: string;
  docsUrl: string | null;
  bodyMessage?: string | null;
}): ConnectorError {
  const { status, slug, docsUrl, bodyMessage } = params;

  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_EXPIRED',
      retryable: false,
      userMessage: `Your ${slug} connection needs to be reconnected — the credential was rejected (HTTP ${status}).`,
      docsHint: docsUrl,
      httpStatus: status,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      retryable: false,
      userMessage: bodyMessage ?? `${slug} could not find the requested resource.`,
      docsHint: docsUrl,
      httpStatus: status,
    };
  }
  if (status === 409) {
    return {
      code: 'CONFLICT',
      retryable: false,
      userMessage: bodyMessage ?? `${slug} rejected this as a conflicting change.`,
      docsHint: docsUrl,
      httpStatus: status,
    };
  }
  if (status === 422 || status === 400) {
    return {
      code: 'VALIDATION',
      retryable: false,
      userMessage: bodyMessage ?? `${slug} rejected the request payload — check field limits and required fields.`,
      docsHint: docsUrl,
      httpStatus: status,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      retryable: true,
      userMessage: `${slug} is rate-limiting this connection — retrying automatically with backoff.`,
      docsHint: docsUrl,
      httpStatus: status,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      userMessage: `${slug} is temporarily unavailable (HTTP ${status}) — this will be retried.`,
      docsHint: docsUrl,
      httpStatus: status,
    };
  }
  return {
    code: 'UNKNOWN',
    retryable: false,
    userMessage: bodyMessage ?? `${slug} returned an unexpected error (HTTP ${status}).`,
    docsHint: docsUrl,
    httpStatus: status,
  };
}

export function mapNetworkError(slug: string, error: unknown): ConnectorError {
  if (error instanceof SyntaxError) {
    return {
      code: 'MALFORMED_RESPONSE',
      retryable: true,
      userMessage: `${slug} returned a response OmniSell could not parse.`,
      docsHint: null,
      httpStatus: null,
    };
  }
  return {
    code: 'PROVIDER_UNAVAILABLE',
    retryable: true,
    userMessage: `Could not reach ${slug}: ${error instanceof Error ? error.message : String(error)}`,
    docsHint: null,
    httpStatus: null,
  };
}
