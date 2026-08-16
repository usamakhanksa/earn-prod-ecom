import type { CountryConfigService } from '../config/country-config.service.js';
import type {
  CountryDetectionInput,
  CountryDetectionResult,
  GeolocationProvider,
} from '../types.js';

/**
 * Layered country detection strategy, exactly as specified:
 *   1. existing user profile country
 *   2. user-selected country (manual override, persisted by the caller in
 *      a cookie/session — this service is transport-agnostic and only
 *      receives the already-read value)
 *   3. browser locale
 *   4. IP/geolocation API
 *   5. fallback country
 *
 * Each layer is only used if it resolves to a country code that is a
 * *known, active* CountryConfig row — an unsupported/unknown code falls
 * through to the next layer rather than being trusted blindly.
 *
 * Returns exactly { countryCode, countryName, currency, language, timezone }.
 */
export class CountryDetectionService {
  constructor(
    private readonly countryConfigService: CountryConfigService,
    private readonly geolocationProvider: GeolocationProvider,
  ) {}

  async detect(input: CountryDetectionInput): Promise<CountryDetectionResult> {
    const candidates: Array<() => Promise<string | null>> = [
      () => Promise.resolve(input.userProfileCountry ?? null),
      () => Promise.resolve(input.userSelectedCountry ?? null),
      () => Promise.resolve(extractRegionFromLocale(input.browserLocale)),
      () => this.lookupViaGeolocation(input.ipAddress),
    ];

    for (const resolveCandidate of candidates) {
      const code = await resolveCandidate();
      if (!code) continue;
      const config = await this.countryConfigService.getByCode(code);
      if (config) {
        return toResult(config);
      }
    }

    const fallback = await this.countryConfigService.getFallback();
    return toResult(fallback);
  }

  private async lookupViaGeolocation(ipAddress?: string | null): Promise<string | null> {
    if (!ipAddress) return null;
    const result = await this.geolocationProvider.lookup(ipAddress);
    return result?.countryCode ?? null;
  }
}

function extractRegionFromLocale(locale?: string | null): string | null {
  if (!locale) return null;
  // Accept-Language headers can list several weighted locales, e.g.
  // "en-US,en;q=0.9,ar;q=0.8" — only the first is used as the primary hint.
  const primary = locale.split(',')[0]?.trim();
  if (!primary) return null;
  const parts = primary.split(/[-_]/);
  const region = parts.length > 1 ? parts[parts.length - 1] : null;
  if (!region || region.length !== 2) return null;
  return region.toUpperCase();
}

function toResult(config: {
  code: string;
  name: string;
  currency: string;
  defaultLanguage: string;
  timezone: string;
}): CountryDetectionResult {
  return {
    countryCode: config.code,
    countryName: config.name,
    currency: config.currency,
    language: config.defaultLanguage,
    timezone: config.timezone,
  };
}
