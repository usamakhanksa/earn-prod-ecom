import { createMarketplaceApiClient } from '@marketplace/shared';

/**
 * Mobile has no cookie jar, so it authenticates with the same
 * MarketplaceApiClient via a Bearer token instead of a cookie — the
 * server-side API accepts either (see
 * apps/marketplace-api/src/middleware/auth.guard.ts extractToken). Token
 * storage (SecureStore) lands with the real login screen in a later pass;
 * for Phase 1 this only wires the base URL so the client is provably the
 * same one web/admin use.
 */
export function resolveApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_MARKETPLACE_API_URL ?? 'http://localhost:4100';
}

let cachedToken: string | null = null;

export const apiClient = createMarketplaceApiClient({
  baseUrl: resolveApiBaseUrl(),
  getToken: () => cachedToken,
});

export function setAuthToken(token: string | null): void {
  cachedToken = token;
}
