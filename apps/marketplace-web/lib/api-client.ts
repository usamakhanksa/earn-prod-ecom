import { createMarketplaceApiClient } from '@marketplace/shared';

/**
 * marketplace-web's only entry point into marketplace-api — always
 * through the shared typed client so the business logic (country rules,
 * auth) never gets re-implemented in a Next.js server action. Cookie-based
 * auth relies on `credentials: 'include'`, which the shared client already
 * sets on every request.
 */
export const apiClient = createMarketplaceApiClient({
  baseUrl: process.env.NEXT_PUBLIC_MARKETPLACE_API_URL ?? 'http://localhost:4100',
});
