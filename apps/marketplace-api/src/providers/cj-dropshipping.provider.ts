import type { CategorySummary, UnifiedProduct } from '@marketplace/shared';
import {
  ProviderNotConfiguredError,
  type AvailabilityResult,
  type MarketplaceProvider,
  type PricingResult,
  type ProductSearchParams,
  type ProductSearchResult,
  type ShippingResult,
} from './marketplace-provider.js';

/**
 * CJDropshippingProvider — a real adapter against CJ Dropshipping's
 * documented API, built to the `MarketplaceProvider` interface.
 *
 * ============================================================================
 * CONFIRMED vs. UNVERIFIED — read before touching this file
 * ============================================================================
 * CONFIRMED (from the user's own live CJ dashboard, not invented — see the
 * task brief): every endpoint PATH this file calls —
 *   /authentication/getAccessToken, /authentication/refreshAccessToken,
 *   /product/list, /product/query, /product/getCategory,
 *   /product/stock/getInventoryByPid, /logistic/freightCalculate.
 * This file NEVER calls a path outside that confirmed list, and never will
 * — inventing a plausible-looking CJ endpoint is explicitly against this
 * project's rules.
 *
 * UNVERIFIED (no real CJ_API_KEY was ever available in this sandbox, so
 * none of the below has been exercised against a live response — see
 * docs/marketplace/DEBT.md):
 *   - The exact request body field names for `/authentication/getAccessToken`
 *     (implemented here as `{ email, password }`, where `password` is the
 *     API key — a common pattern for this class of dropshipping API, but
 *     NOT confirmed against CJ's real docs in this session).
 *   - The exact response envelope shape (implemented here as CJ's typical
 *     `{ code, result, message, data }` wrapper — a very common convention
 *     for this vendor, again not independently confirmed here).
 *   - The exact request/response field names for `/product/list`,
 *     `/product/query`, `/product/getCategory`,
 *     `/product/stock/getInventoryByPid`, and `/logistic/freightCalculate`.
 *   - Whether CJ's inventory model is even country-scoped the way this
 *     provider's `getAvailability()` needs (CJ inventory is warehouse-based;
 *     mapping "warehouse" -> "destination country" is a real, unresolved
 *     gap, documented below at that method).
 *   - Whether CJ exposes country-specific pricing at all (no distinct
 *     pricing endpoint appears in the confirmed list; `getPricing()` reuses
 *     `/product/query`'s product-level price, which is NOT known to vary by
 *     destination country).
 *
 * Every method below calls `assertConfigured()` FIRST and throws
 * `ProviderNotConfiguredError` when `CJ_API_KEY` is unset — this provider
 * makes zero network calls in this sandbox (no real key exists here), and
 * is never selected by the provider registry unless a real key is
 * configured. This is the same honest "not configured" gate OmniSell's own
 * connector adapters use for missing credentials — never a silent mock
 * fallback, never a crash with an opaque stack trace.
 */
export interface CJDropshippingProviderOptions {
  apiKey?: string | undefined;
  /** Needed by the (unverified) getAccessToken request shape below. */
  email?: string | undefined;
  baseUrl: string;
}

interface CjEnvelope<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
}

interface CjAccessTokenData {
  accessToken: string;
  accessTokenExpiryDate: string;
  refreshToken: string;
  refreshTokenExpiryDate: string;
}

export class CJDropshippingProvider implements MarketplaceProvider {
  readonly id = 'cj_dropshipping';

  private readonly apiKey: string | undefined;
  private readonly email: string | undefined;
  private readonly baseUrl: string;
  private cachedAccessToken: string | null = null;

  constructor(options: CJDropshippingProviderOptions) {
    this.apiKey = options.apiKey;
    this.email = options.email;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new ProviderNotConfiguredError(this.id, 'CJ_API_KEY');
    }
  }

  /**
   * UNVERIFIED request body shape (see file header). Cached in-memory for
   * the process lifetime — a real implementation would also honor
   * `accessTokenExpiryDate` and call `/authentication/refreshAccessToken`
   * (confirmed path, not implemented here — no key to test the refresh
   * flow against either).
   */
  private async getAccessToken(): Promise<string> {
    this.assertConfigured();
    if (this.cachedAccessToken) return this.cachedAccessToken;

    const response = await fetch(`${this.baseUrl}/authentication/getAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.apiKey }),
    });
    const payload = (await response.json()) as CjEnvelope<CjAccessTokenData>;
    if (!response.ok || !payload.result) {
      throw new Error(`CJ Dropshipping auth failed: ${payload.message ?? response.statusText}`);
    }
    this.cachedAccessToken = payload.data.accessToken;
    return this.cachedAccessToken;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        // UNVERIFIED header name — CJ's documented convention for their v2
        // API is commonly "CJ-Access-Token"; not confirmed live here.
        'CJ-Access-Token': token,
        ...init.headers,
      },
    });
    const payload = (await response.json()) as CjEnvelope<T>;
    if (!response.ok || !payload.result) {
      throw new Error(`CJ Dropshipping request to ${path} failed: ${payload.message ?? response.statusText}`);
    }
    return payload.data;
  }

  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    this.assertConfigured();
    // Confirmed path: /product/list. UNVERIFIED request/response fields —
    // mapped best-effort from typical CJ product-list parameter names
    // (pageNum/pageSize/categoryId/productNameEn), not confirmed live.
    const data = await this.request<{ list: unknown[]; total: number }>('/product/list', {
      method: 'POST',
      body: JSON.stringify({
        pageNum: params.page,
        pageSize: params.limit,
        productNameEn: params.query,
        categoryId: params.categorySlug,
      }),
    });
    throw new Error(
      'CJDropshippingProvider.searchProducts: response mapping is not implemented — ' +
        `CJ's raw /product/list item shape has never been observed against a real ` +
        `account in this build (no CJ_API_KEY was ever available). Received ${data.list.length} ` +
        'raw item(s); normalizing them into UnifiedProduct is a documented gap (see DEBT.md), not ' +
        'a silent guess.',
    );
  }

  async getProduct(idOrSlug: string): Promise<UnifiedProduct | null> {
    this.assertConfigured();
    // Confirmed path: /product/query. UNVERIFIED param name for "look up by
    // id" (implemented as `pid`, CJ's common product-id field name).
    await this.request('/product/query', {
      method: 'POST',
      body: JSON.stringify({ pid: idOrSlug }),
    });
    throw new Error(
      'CJDropshippingProvider.getProduct: response mapping to UnifiedProduct is not implemented ' +
        '— same documented gap as searchProducts (see DEBT.md).',
    );
  }

  async getCategories(): Promise<CategorySummary[]> {
    this.assertConfigured();
    // Confirmed path: /product/getCategory. UNVERIFIED response shape.
    await this.request('/product/getCategory');
    throw new Error(
      'CJDropshippingProvider.getCategories: response mapping to CategorySummary[] is not ' +
        'implemented — same documented gap (see DEBT.md).',
    );
  }

  async getAvailability(productId: string, countryCode: string): Promise<AvailabilityResult> {
    this.assertConfigured();
    // Confirmed path: /product/stock/getInventoryByPid. REAL, DOCUMENTED
    // GAP (not just an unverified shape): CJ's inventory model is
    // warehouse-based (e.g. "US warehouse", "CN warehouse"), not
    // country-based. Mapping a destination `countryCode` to "which CJ
    // warehouse code(s) can ship there" needs CJ's warehouse/shipping-zone
    // data, which isn't in the confirmed endpoint list this build was given.
    // This method intentionally does not guess that mapping.
    await this.request('/product/stock/getInventoryByPid', {
      method: 'POST',
      body: JSON.stringify({ pid: productId }),
    });
    throw new Error(
      `CJDropshippingProvider.getAvailability: mapping CJ's warehouse-based inventory to a ` +
        `destination country ("${countryCode}") is an unresolved gap, not implemented — see DEBT.md.`,
    );
  }

  async getPricing(productId: string): Promise<PricingResult> {
    this.assertConfigured();
    // No distinct pricing endpoint exists in the confirmed list — reuses
    // /product/query. REAL, DOCUMENTED GAP: CJ pricing is not known to vary
    // by destination country from the confirmed endpoints alone, so a
    // `countryCode`-specific price cannot be honestly derived here.
    await this.request('/product/query', {
      method: 'POST',
      body: JSON.stringify({ pid: productId }),
    });
    throw new Error(
      'CJDropshippingProvider.getPricing: extracting a price from /product/query\'s raw response ' +
        'is not implemented — same documented gap as getProduct (see DEBT.md).',
    );
  }

  async getShipping(productId: string, countryCode: string): Promise<ShippingResult> {
    this.assertConfigured();
    // Confirmed path: /logistic/freightCalculate. UNVERIFIED request field
    // names (implemented best-effort as startCountryCode/endCountryCode,
    // common freight-calculator parameter names for this class of API).
    await this.request('/logistic/freightCalculate', {
      method: 'POST',
      body: JSON.stringify({ pid: productId, endCountryCode: countryCode }),
    });
    throw new Error(
      'CJDropshippingProvider.getShipping: response mapping to the shared shipping estimate shape ' +
        'is not implemented — same documented gap (see DEBT.md).',
    );
  }
}

export function createCJDropshippingProvider(options: CJDropshippingProviderOptions): CJDropshippingProvider {
  return new CJDropshippingProvider(options);
}
