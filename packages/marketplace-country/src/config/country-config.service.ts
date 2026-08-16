import type { CountryConfig, CountryConfigRepository } from '../types.js';
import { DEFAULT_FALLBACK_COUNTRY_CODE } from './country-config-data.js';

/**
 * CountryConfigService (a.k.a. CountryRulesService in the spec) — the
 * single place country-specific data (currency, language, timezone,
 * supported payments/marketplaces/shipping) is read from. UI code and API
 * route handlers must call into this service instead of ever branching on
 * `if (country === 'SA')` directly.
 */
export class CountryConfigService {
  constructor(
    private readonly repository: CountryConfigRepository,
    private readonly fallbackCode: string = DEFAULT_FALLBACK_COUNTRY_CODE,
  ) {}

  async listActive(): Promise<CountryConfig[]> {
    const all = await this.repository.findAll();
    return all.filter((c) => c.isActive);
  }

  async getByCode(code: string): Promise<CountryConfig | null> {
    if (!code || code.length !== 2) {
      return null;
    }
    const config = await this.repository.findByCode(code);
    return config && config.isActive ? config : null;
  }

  async isSupported(code: string): Promise<boolean> {
    return (await this.getByCode(code)) !== null;
  }

  async getFallback(): Promise<CountryConfig> {
    const fallback = await this.repository.findByCode(this.fallbackCode);
    if (!fallback) {
      throw new Error(
        `Fallback country "${this.fallbackCode}" is missing from CountryConfig data — this is a seed/config bug, not a runtime condition callers should handle.`,
      );
    }
    return fallback;
  }

  /** Which payment methods this country's marketplace supports, per-country config only. */
  async supportedPayments(code: string): Promise<string[]> {
    const config = await this.getByCode(code);
    return config?.supportedPayments ?? [];
  }

  async supportedMarketplaces(code: string): Promise<string[]> {
    const config = await this.getByCode(code);
    return config?.supportedMarketplaces ?? [];
  }

  async shippingProviders(code: string): Promise<string[]> {
    const config = await this.getByCode(code);
    return config?.shippingProviders ?? [];
  }

  /** Category slugs this country's marketplace never sells, per-country config only. */
  async restrictedCategorySlugs(code: string): Promise<string[]> {
    const config = await this.getByCode(code);
    return config?.restrictedCategorySlugs ?? [];
  }
}
