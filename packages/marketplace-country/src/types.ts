import type { CountryDetectionResult } from '@marketplace/shared';

export type { CountryDetectionResult };

/**
 * Domain shape of a CountryConfig row. Mirrors
 * apps/marketplace-api/prisma/schema.prisma `CountryConfig` model. This
 * package never imports Prisma — it only depends on this plain interface so
 * both the in-memory mock repository and a future Prisma-backed repository
 * (defined in marketplace-api) can implement `CountryConfigRepository`
 * against the exact same contract.
 */
export interface CountryConfig {
  code: string;
  name: string;
  nativeName: string | null;
  currency: string;
  currencySymbol: string;
  defaultLanguage: string;
  timezone: string;
  isActive: boolean;
  supportedPayments: string[];
  supportedMarketplaces: string[];
  shippingProviders: string[];
  /**
   * Category slugs this country's marketplace never sells (e.g. alcohol in
   * countries where it's illegal to sell online). Phase 2's country product
   * rule engine (CountryProductRulesService) reads this — never a hardcoded
   * `if (country === 'SA')` branch in route/UI code. Empty array = no
   * category restrictions for this country.
   */
  restrictedCategorySlugs: string[];
}

export interface CountryConfigRepository {
  findAll(): Promise<CountryConfig[]>;
  findByCode(code: string): Promise<CountryConfig | null>;
}

/**
 * Inputs the layered detection strategy can be given. All optional — the
 * service falls through the layers in order and stops at the first one
 * that resolves to a known, active country code.
 */
export interface CountryDetectionInput {
  /** 1. Country stored on the authenticated user's profile, if any. */
  userProfileCountry?: string | null;
  /** 2. Country the user explicitly picked before (cookie/session override). */
  userSelectedCountry?: string | null;
  /** 3. Browser/device locale, e.g. "en-US", "ar-SA", "en-GB". */
  browserLocale?: string | null;
  /** 4. Client IP address, passed to the geolocation provider. */
  ipAddress?: string | null;
}

export interface GeolocationLookupResult {
  countryCode: string;
}

export interface GeolocationProvider {
  /** Human-readable id, surfaced in logs/health checks (e.g. "mock", "ipinfo"). */
  readonly id: string;
  lookup(ipAddress: string): Promise<GeolocationLookupResult | null>;
}
