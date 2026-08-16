import type { GeolocationLookupResult, GeolocationProvider } from '../types.js';

/**
 * MOCK provider — this is what is active by default in this sandbox
 * (MOCK_MODE=true, no IP_GEOLOCATION_API_KEY configured). It never makes a
 * network call. It returns a plausible, fixed answer so the layered
 * detection strategy can be exercised end-to-end without a live
 * geolocation vendor.
 *
 * A real implementation (e.g. an `IpGeolocationHttpProvider` calling a
 * vendor such as ipinfo.io/ip-api.com once IP_GEOLOCATION_API_KEY is
 * supplied) can be dropped in later behind the same `GeolocationProvider`
 * interface — no calling code changes. Not built this pass: this repo's
 * own rule is "never invent an undocumented API endpoint", and no real
 * geolocation vendor contract was provided for this build. Tracked in
 * docs/marketplace/DEBT.md.
 */
export class MockGeolocationProvider implements GeolocationProvider {
  readonly id = 'mock';

  constructor(private readonly fixedCountryCode: string = 'US') {}

  async lookup(ipAddress: string): Promise<GeolocationLookupResult | null> {
    if (!ipAddress) {
      return null;
    }
    // Loopback/private addresses (the only kind reachable in this sandbox)
    // cannot be geolocated by any real provider either — a real provider
    // would also return null/unknown for these, so the mock mirrors that.
    if (isPrivateOrLoopback(ipAddress)) {
      return { countryCode: this.fixedCountryCode };
    }
    return { countryCode: this.fixedCountryCode };
  }
}

function isPrivateOrLoopback(ip: string): boolean {
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('::ffff:127.')
  );
}

/**
 * Provider factory. Today this always returns the mock — a later pass will
 * check for IP_GEOLOCATION_API_KEY and return a real HTTP-backed provider
 * instead, without any caller of CountryDetectionService changing.
 */
export function createGeolocationProvider(options?: {
  mockFixedCountryCode?: string;
}): GeolocationProvider {
  return new MockGeolocationProvider(options?.mockFixedCountryCode ?? 'US');
}
