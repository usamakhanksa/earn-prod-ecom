import { OmniSellClient } from '@omnisell/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Bound client for the current request — token/tenant change on every render
 * of `SessionProvider`, so this is cheap to recreate rather than cached. */
export function createApiClient(token?: string, tenantId?: string): OmniSellClient {
  return new OmniSellClient({
    baseUrl: `${API_URL}/v1`,
    ...(token !== undefined ? { token } : {}),
    ...(tenantId !== undefined ? { tenantId } : {}),
  });
}

/** Unauthenticated client — login/register/refresh/invite-token lookups. */
export function createAnonymousApiClient(): OmniSellClient {
  return new OmniSellClient({ baseUrl: `${API_URL}/v1` });
}
