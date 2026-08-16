import type { CountryConfigService } from '../config/country-config.service.js';

/**
 * One row of a product's per-country availability. Deliberately a plain,
 * minimal shape (not a Prisma type) so this package stays free of any
 * dependency on marketplace-api's generated Prisma client — the exact same
 * discipline `CountryConfigRepository` already follows.
 */
export interface ProductCountryAvailabilityRow {
  countryCode: string;
  isAvailable: boolean;
}

export interface CountryAwareProduct {
  /** Slug of the product's primary category, or null if uncategorized. */
  categorySlug: string | null;
  countryAvailability: ProductCountryAvailabilityRow[];
}

/**
 * The Phase 2 "country product rule engine" the spec asks for (sections
 * 45-46). This is the ONE place product availability, category
 * availability, and marketplace availability are decided from
 * `CountryConfig` data — marketplace-api's routes/providers and
 * marketplace-web/mobile's UI must call into this service instead of ever
 * writing `if (countryCode === 'SA')` themselves. Keeping it here (rather
 * than in apps/marketplace-api) is deliberate: it's the one rules engine for
 * this concern, not a second competing one living next to the API routes.
 */
export class CountryProductRulesService {
  constructor(private readonly countryConfigService: CountryConfigService) {}

  /**
   * A country's marketplace is available at all only if it has an active
   * CountryConfig row (same notion `CountryConfigService.isSupported` uses
   * elsewhere) — an unknown/inactive country sells nothing.
   */
  async isMarketplaceAvailable(countryCode: string): Promise<boolean> {
    return this.countryConfigService.isSupported(countryCode);
  }

  /** Is this category sold at all in this country (independent of any one product)? */
  async isCategoryAvailable(countryCode: string, categorySlug: string | null): Promise<boolean> {
    const config = await this.countryConfigService.getByCode(countryCode);
    if (!config) return false;
    if (!categorySlug) return true;
    return !config.restrictedCategorySlugs.includes(categorySlug);
  }

  /**
   * Is this specific product available in this country? Requires all three:
   * the country's marketplace is active, the product's category isn't
   * restricted there, and the product itself has an explicit available
   * per-country row for that country.
   */
  async isProductAvailable(countryCode: string, product: CountryAwareProduct): Promise<boolean> {
    const config = await this.countryConfigService.getByCode(countryCode);
    if (!config) return false;

    if (product.categorySlug && config.restrictedCategorySlugs.includes(product.categorySlug)) {
      return false;
    }

    const normalized = countryCode.trim().toUpperCase();
    const row = product.countryAvailability.find(
      (r) => r.countryCode.trim().toUpperCase() === normalized,
    );
    return Boolean(row?.isAvailable);
  }

  /** Filters a list of category slugs down to the ones sold in this country. */
  async filterAvailableCategorySlugs(countryCode: string, categorySlugs: string[]): Promise<string[]> {
    const config = await this.countryConfigService.getByCode(countryCode);
    if (!config) return [];
    return categorySlugs.filter((slug) => !config.restrictedCategorySlugs.includes(slug));
  }
}
