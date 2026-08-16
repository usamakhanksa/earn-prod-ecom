import { OmniSellClient } from '@omnisell/api-client';

// Expo exposes env vars prefixed EXPO_PUBLIC_ to the client bundle.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export function createApiClient(token?: string): OmniSellClient {
  return new OmniSellClient({ baseUrl: `${API_URL}/v1`, ...(token !== undefined ? { token } : {}) });
}

export function createAnonymousApiClient(): OmniSellClient {
  return new OmniSellClient({ baseUrl: `${API_URL}/v1` });
}
