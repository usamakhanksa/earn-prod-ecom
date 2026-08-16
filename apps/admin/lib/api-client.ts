import { OmniSellClient } from '@omnisell/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function createApiClient(token?: string): OmniSellClient {
  return new OmniSellClient({ baseUrl: `${API_URL}/v1`, ...(token !== undefined ? { token } : {}) });
}

export function createAnonymousApiClient(): OmniSellClient {
  return new OmniSellClient({ baseUrl: `${API_URL}/v1` });
}
