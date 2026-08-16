import type {
  AffiliateSummary,
  CountryConfig,
  DetectedCountry,
  MarketplaceProductSummary,
  OfferDTO,
  PayoutDTO,
  SupplierSummary,
  TaskDTO,
} from '@omnisell/shared';
import { OmniSellClient } from './client';

/**
 * Typed endpoint helpers for the global marketplace API (ecom-front.txt).
 * Shared by web, admin and mobile via the same `OmniSellClient`. All money in
 * responses is a decimal-minor string.
 */
export interface ListProductsParams {
  country?: string;
  category?: string;
  search?: string;
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'newest';
  page?: number;
  pageSize?: number;
}

export interface AffiliateLinkDTO {
  id: string;
  type: string;
  title: string | null;
  url: string;
  clicks: number;
  conversions: number;
  createdAt: string;
}

export class MarketplaceApi {
  constructor(private readonly client: OmniSellClient) {}

  // --- Countries (spec §6/§7) -------------------------------------------------
  listCountries(): Promise<{ items: CountryConfig[] }> {
    return this.client.get('/marketplace/countries');
  }
  detectCountry(): Promise<DetectedCountry> {
    return this.client.get('/marketplace/countries/detect');
  }
  getCountry(code: string): Promise<CountryConfig> {
    return this.client.get(`/marketplace/countries/${code}`);
  }

  // --- Storefront catalog (spec §8) ---------------------------------------------
  listProducts(params?: ListProductsParams): Promise<{ items: MarketplaceProductSummary[]; total: number; page: number; pageSize: number }> {
    return this.client.get('/marketplace/products', {
      ...(params !== undefined ? { query: params as Record<string, string | number> } : {}),
    });
  }
  getProduct(slug: string): Promise<MarketplaceProductSummary> {
    return this.client.get(`/marketplace/products/${slug}`);
  }

  // --- Suppliers (spec §12) ------------------------------------------------------
  listSuppliers(country?: string): Promise<{ items: SupplierSummary[] }> {
    return this.client.get('/marketplace/suppliers', country !== undefined ? { query: { country } } : undefined);
  }
  registerSupplier(body: Record<string, unknown>): Promise<{ id: string; status: string }> {
    return this.client.post('/marketplace/suppliers/register', body);
  }
  getMySupplier(): Promise<{ id: string; companyName: string; status: string }> {
    return this.client.get('/marketplace/suppliers/me');
  }

  // --- Affiliates (spec §16–§18) -------------------------------------------------
  registerAffiliate(body: Record<string, unknown>): Promise<AffiliateSummary> {
    return this.client.post('/marketplace/affiliates/register', body);
  }
  getMyAffiliate(): Promise<AffiliateSummary> {
    return this.client.get('/marketplace/affiliates/me');
  }
  createAffiliateLink(body: Record<string, unknown>): Promise<{ link: AffiliateLinkDTO; url: string }> {
    return this.client.post('/marketplace/affiliates/links', body);
  }
  listAffiliateLinks(): Promise<AffiliateLinkDTO[]> {
    return this.client.get('/marketplace/affiliates/links');
  }
  trackAffiliateClick(body: Record<string, unknown>): Promise<{ ok: true; clickId: string; isFraud: boolean }> {
    return this.client.post('/marketplace/affiliates/clicks/track', body);
  }
  affiliateEarnings(): Promise<{ pendingMinor: string; approvedMinor: string; paidMinor: string; totalMinor: string; currency: string }> {
    return this.client.get('/marketplace/affiliates/earnings');
  }

  // --- Tasks & offers (spec §20/§21) ---------------------------------------------
  listTasks(country?: string): Promise<{ items: TaskDTO[] }> {
    return this.client.get('/marketplace/tasks', country !== undefined ? { query: { country } } : undefined);
  }
  listOffers(country?: string): Promise<{ items: OfferDTO[] }> {
    return this.client.get('/marketplace/offers', country !== undefined ? { query: { country } } : undefined);
  }
  completeTask(taskId: string, validationToken?: string): Promise<{ status: string; rewardMinor: string; currency: string }> {
    return this.client.post(`/marketplace/tasks/${taskId}/complete`, { ...(validationToken !== undefined ? { validationToken } : {}) });
  }
  completeOffer(offerId: string): Promise<{ status: string; rewardMinor: string; currency: string }> {
    return this.client.post(`/marketplace/offers/${offerId}/complete`, {});
  }

  // --- Payouts (spec §22/§26) -----------------------------------------------------
  requestPayout(body: { amountMinor: string; currency: string; method: string; destination?: string; idempotencyKey?: string }): Promise<PayoutDTO> {
    return this.client.post('/marketplace/payouts', body);
  }
  listPayouts(): Promise<{ items: PayoutDTO[] }> {
    return this.client.get('/marketplace/payouts');
  }
}