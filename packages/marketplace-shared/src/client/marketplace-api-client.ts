import {
  authResponseSchema,
  loginSchema,
  registerSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from '../schemas/auth.schema.js';
import {
  countryConfigSummarySchema,
  countryDetectionResultSchema,
  countryOverrideInputSchema,
  type CountryConfigSummary,
  type CountryDetectionResult,
  type CountryOverrideInput,
} from '../schemas/country.schema.js';
import {
  categoryListQuerySchema,
  categorySummarySchema,
  paginatedProductsSchema,
  unifiedProductSchema,
  type CategoryListQuery,
  type CategorySummary,
  type PaginatedProducts,
  type ProductListQueryInput,
  type UnifiedProduct,
} from '../schemas/product.schema.js';
import { z } from 'zod';

/**
 * Thin typed client over marketplace-api's HTTP surface. Shared by
 * marketplace-web, marketplace-admin (route group) and marketplace-mobile so
 * all three consume the exact same contract — no endpoint is duplicated or
 * re-guessed per client.
 *
 * Deliberately dependency-free (uses the platform `fetch`, available in
 * Node 20+, modern browsers, and Expo/React Native) so this package stays
 * usable from all three consumers without extra install weight.
 */

export interface MarketplaceApiClientOptions {
  /** Base URL of marketplace-api, e.g. http://localhost:4100 */
  baseUrl: string;
  /** Bearer token for non-cookie consumers (mobile). Web relies on cookies. */
  getToken?: () => string | null | undefined;
  /** Override fetch implementation (tests / RN). */
  fetchImpl?: typeof fetch;
}

export class MarketplaceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'MarketplaceApiError';
  }
}

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  mockMode: z.boolean(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export class MarketplaceApiClient {
  private readonly baseUrl: string;
  private readonly getToken: (() => string | null | undefined) | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MarketplaceApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getToken = options.getToken;
    // `fetch` is a native browser function that throws "Illegal invocation"
    // if called with a `this` other than window/globalThis — which is
    // exactly what happens when it's stored as `this.fetchImpl` and later
    // invoked as `this.fetchImpl(...)`. Binding to globalThis here fixes a
    // real bug caught while boot-testing marketplace-web in a browser.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken?.();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : `Request to ${path} failed with status ${response.status}`;
      throw new MarketplaceApiError(message, response.status, payload);
    }

    return schema.parse(payload);
  }

  health(): Promise<HealthResponse> {
    return this.request('/health', healthResponseSchema);
  }

  detectCountry(headers?: Record<string, string>): Promise<CountryDetectionResult> {
    return this.request(
      '/api/country/detect',
      countryDetectionResultSchema,
      headers ? { headers } : {},
    );
  }

  overrideCountry(input: CountryOverrideInput): Promise<CountryDetectionResult> {
    const body = countryOverrideInputSchema.parse(input);
    return this.request('/api/country/override', countryDetectionResultSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  listCountries(): Promise<CountryConfigSummary[]> {
    return this.request('/api/countries', z.array(countryConfigSummarySchema));
  }

  register(input: RegisterInput): Promise<AuthResponse> {
    const body = registerSchema.parse(input);
    return this.request('/api/auth/register', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  login(input: LoginInput): Promise<AuthResponse> {
    const body = loginSchema.parse(input);
    return this.request('/api/auth/login', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  logout(): Promise<{ ok: true }> {
    return this.request('/api/auth/logout', z.object({ ok: z.literal(true) }), {
      method: 'POST',
    });
  }

  me(): Promise<AuthResponse['user']> {
    return this.request('/api/auth/me', authResponseSchema.shape.user);
  }

  listProducts(query: ProductListQueryInput = {}): Promise<PaginatedProducts> {
    const qs = buildQueryString(query);
    return this.request(`/api/products${qs}`, paginatedProductsSchema);
  }

  getProduct(slug: string, country?: string): Promise<UnifiedProduct> {
    const qs = buildQueryString(country ? { country } : {});
    return this.request(`/api/products/${encodeURIComponent(slug)}${qs}`, unifiedProductSchema);
  }

  listCategories(query: CategoryListQuery = {}): Promise<CategorySummary[]> {
    const parsed = categoryListQuerySchema.parse(query);
    const qs = buildQueryString(parsed);
    return this.request(`/api/categories${qs}`, z.array(categorySummarySchema));
  }

  getCategory(slug: string, country?: string): Promise<CategorySummary> {
    const qs = buildQueryString(country ? { country } : {});
    return this.request(`/api/categories/${encodeURIComponent(slug)}${qs}`, categorySummarySchema);
  }
}

/**
 * Builds a `?a=1&b=2` query string from a plain object, skipping
 * undefined/null/empty-string values. Used by every list/filter endpoint
 * above so query construction isn't duplicated per call site.
 */
function buildQueryString(params: Record<string, unknown>): string {
  const usable = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (usable.length === 0) return '';
  const search = new URLSearchParams();
  for (const [key, value] of usable) {
    search.set(key, String(value));
  }
  return `?${search.toString()}`;
}

export function createMarketplaceApiClient(
  options: MarketplaceApiClientOptions,
): MarketplaceApiClient {
  return new MarketplaceApiClient(options);
}
