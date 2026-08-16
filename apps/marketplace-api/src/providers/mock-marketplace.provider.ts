import type { CategorySummary, UnifiedProduct } from '@marketplace/shared';
import { CountryConfigService, CountryProductRulesService } from '@marketplace/country';
import type { ProductRepository } from '../repositories/product.repository.js';
import { normalizeCategory, normalizeInternalProduct } from './normalize.js';
import type {
  AvailabilityResult,
  MarketplaceProvider,
  PricingResult,
  ProductSearchParams,
  ProductSearchResult,
  ShippingResult,
} from './marketplace-provider.js';

/**
 * The default, fully-working provider — this is what actually runs and
 * gets verified in this sandbox. Backed by `ProductRepository` (mock or,
 * later, Prisma — see repository-factory.ts), so it works identically
 * whether that repository is in-memory or a real database; only the
 * repository swap changes, never this provider's logic.
 *
 * Despite the name, this class isn't hardcoded to the mock repository —
 * "Mock" here names the provider's role (this marketplace's own internal
 * catalog, as opposed to an external supplier feed like CJ Dropshipping),
 * matching the spec's naming. It applies the country product rule engine
 * (packages/marketplace-country's CountryProductRulesService) so no
 * `if (country === 'SA')` branch ever appears here or in a route handler.
 */
export class MockMarketplaceProvider implements MarketplaceProvider {
  readonly id = 'mock';

  private readonly countryProductRulesService: CountryProductRulesService;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly countryConfigService: CountryConfigService,
  ) {
    this.countryProductRulesService = new CountryProductRulesService(countryConfigService);
  }

  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    let excludeCategorySlugs: string[] = [];
    let shippingProviders: string[] = [];

    if (params.countryCode) {
      const countryCode = params.countryCode;
      const supported = await this.countryConfigService.isSupported(countryCode);
      if (!supported) {
        // Country's marketplace isn't active at all — nothing to sell.
        return { items: [], total: 0, page: params.page, limit: params.limit };
      }
      excludeCategorySlugs = await this.countryConfigService.restrictedCategorySlugs(countryCode);
      shippingProviders = await this.countryConfigService.shippingProviders(countryCode);

      if (params.categorySlug && excludeCategorySlugs.includes(params.categorySlug)) {
        return { items: [], total: 0, page: params.page, limit: params.limit };
      }
    }

    const { items, total } = await this.productRepository.listProducts({
      categorySlug: params.categorySlug,
      countryCode: params.countryCode,
      excludeCategorySlugs,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      minRating: params.minRating,
      search: params.query,
      sort: params.sort,
      page: params.page,
      limit: params.limit,
    });

    return {
      items: items.map((record) =>
        normalizeInternalProduct(record, { countryCode: params.countryCode, shippingProviders }),
      ),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getProduct(idOrSlug: string, countryCode?: string): Promise<UnifiedProduct | null> {
    const record =
      (await this.productRepository.findProductBySlug(idOrSlug)) ??
      (await this.productRepository.findProductById(idOrSlug));
    if (!record) return null;

    const shippingProviders = countryCode
      ? await this.countryConfigService.shippingProviders(countryCode)
      : undefined;

    return normalizeInternalProduct(record, { countryCode, shippingProviders });
  }

  async getCategories(countryCode?: string): Promise<CategorySummary[]> {
    const categories = await this.productRepository.listCategories();
    const results: CategorySummary[] = [];
    for (const category of categories) {
      const isAvailable = countryCode
        ? await this.countryProductRulesService.isCategoryAvailable(countryCode, category.slug)
        : true;
      // "GET /categories?country=SA-style filtering actually works" — an
      // unavailable category is excluded outright, not just flagged.
      if (countryCode && !isAvailable) continue;
      results.push(normalizeCategory(category, isAvailable));
    }
    return results;
  }

  async getAvailability(productId: string, countryCode: string): Promise<AvailabilityResult> {
    const record =
      (await this.productRepository.findProductById(productId)) ??
      (await this.productRepository.findProductBySlug(productId));
    if (!record) {
      return { productId, countryCode, available: false, stock: null };
    }

    const available = await this.countryProductRulesService.isProductAvailable(countryCode, {
      categorySlug: record.category?.slug ?? null,
      countryAvailability: record.countryAvailability,
    });

    const stock = record.variants.length > 0
      ? record.variants.reduce((sum, v) => sum + v.stock, 0)
      : null;

    return { productId: record.id, countryCode, available, stock: available ? stock : null };
  }

  async getPricing(productId: string, countryCode: string): Promise<PricingResult> {
    const record =
      (await this.productRepository.findProductById(productId)) ??
      (await this.productRepository.findProductBySlug(productId));
    if (!record) {
      throw new Error(`getPricing: no product found for "${productId}".`);
    }
    const row = record.countryAvailability.find(
      (r) => r.countryCode === countryCode.toUpperCase(),
    );
    return {
      productId: record.id,
      countryCode,
      price: row?.price ?? record.basePrice,
      currency: row?.currency ?? record.baseCurrency,
      originalPrice: record.compareAtPrice,
    };
  }

  async getShipping(productId: string, countryCode: string): Promise<ShippingResult> {
    const record =
      (await this.productRepository.findProductById(productId)) ??
      (await this.productRepository.findProductBySlug(productId));
    if (!record) {
      throw new Error(`getShipping: no product found for "${productId}".`);
    }
    const shippingProviders = await this.countryConfigService.shippingProviders(countryCode);
    const normalized = normalizeInternalProduct(record, { countryCode, shippingProviders });
    if (!normalized.shipping) {
      throw new Error('getShipping: shipping estimate unexpectedly missing.');
    }
    return normalized.shipping;
  }
}
