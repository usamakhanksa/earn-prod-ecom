/**
 * Minimal fetch wrapper shared by every adapter. Uses the platform global
 * `fetch` (Node 18+/Nest already relies on it — see apps/api/src/oauth's
 * OAuthService) so no extra HTTP client dependency is needed, and MSW v2
 * intercepts this exact global in tests (test/msw/server.ts).
 */
export class ConnectorHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(`HTTP ${status}`);
    this.name = 'ConnectorHttpError';
  }
}

export interface ConnectorFetchInit extends RequestInit {
  headers?: Record<string, string>;
}

export async function fetchJson<T>(url: string, init: ConnectorFetchInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new ConnectorHttpError(response.status, text, headersToRecord(response.headers));
  }
  if (text.length === 0) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SyntaxError(`Malformed JSON response from ${url}`);
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/** Extracts a human-readable message from a provider's error body if it looks
 * like `{ error: string }`, `{ message: string }`, or `{ errors: [...] }` —
 * the three shapes covering Printful/Printify/Gelato/Prodigi's documented
 * error responses — without assuming any one exact schema. */
export function extractBodyMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error !== null && typeof parsed.error === 'object' && 'message' in parsed.error) {
      const message = (parsed.error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      return parsed.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('; ');
    }
    return null;
  } catch {
    return bodyText.length > 0 && bodyText.length < 300 ? bodyText : null;
  }
}
