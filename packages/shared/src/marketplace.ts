/**
 * Global marketplace shared catalog (spec: ecom-front.txt).
 *
 * This is the single source of truth for country-aware configuration that the
 * API, web, admin and mobile surfaces all consume. The API persists an
 * authoritative copy in the `CountryConfig` table (admin-editable); this module
 * provides the static fallback used by MOCK_MODE and by the client apps when
 * the backend is unreachable. Business rules live here / in API services, never
 * in React components.
 */

export interface CountryConfig {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO-4217
  currencySymbol: string;
  defaultLanguage: string; // BCP-47
  timezone: string; // IANA
  supportedPayments: string[];
  supportedMarketplaces: string[];
  shippingProviders: string[];
}

export interface DetectedCountry {
  countryCode: string;
  countryName: string;
  currency: string;
  language: string;
  timezone: string;
}

/** Supported UI languages (spec §37). `rtl` marks right-to-left scripts. */
export interface LanguageConfig {
  code: string;
  name: string;
  rtl: boolean;
}

export const SUPPORTED_LANGUAGES: readonly LanguageConfig[] = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'fr', name: 'Français', rtl: false },
  { code: 'de', name: 'Deutsch', rtl: false },
  { code: 'es', name: 'Español', rtl: false },
  { code: 'it', name: 'Italiano', rtl: false },
  { code: 'pt', name: 'Português', rtl: false },
  { code: 'hi', name: 'हिन्दी', rtl: false },
  { code: 'ur', name: 'اردو', rtl: true },
  { code: 'zh', name: '中文', rtl: false },
  { code: 'ja', name: '日本語', rtl: false },
  { code: 'ko', name: '한국어', rtl: false },
];

export const DEFAULT_COUNTRY_CODE = 'US';

/**
 * Static country catalog (ecom-front.txt §7). In production the API reads the
 * admin-editable `CountryConfig` table; this array is the seed/MOCK fallback.
 */
export const MARKETPLACE_COUNTRIES: readonly CountryConfig[] = [
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', currencySymbol: 'SAR', defaultLanguage: 'ar', timezone: 'Asia/Riyadh', supportedPayments: ['STRIPE', 'MOBICASH', 'BANK'], supportedMarketplaces: ['AMAZON', 'NOON'], shippingProviders: ['ARAMEX', 'SMSA'] },
  { code: 'US', name: 'United States', currency: 'USD', currencySymbol: '$', defaultLanguage: 'en', timezone: 'America/New_York', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON', 'WALMART', 'EBAY'], shippingProviders: ['USPS', 'UPS', 'FEDEX'] },
  { code: 'CA', name: 'Canada', currency: 'CAD', currencySymbol: 'CA$', defaultLanguage: 'en', timezone: 'America/Toronto', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON', 'EBAY'], shippingProviders: ['CANADA POST'] },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', currencySymbol: '£', defaultLanguage: 'en', timezone: 'Europe/London', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON', 'EBAY'], shippingProviders: ['ROYAL MAIL', 'DHL'] },
  { code: 'DE', name: 'Germany', currency: 'EUR', currencySymbol: '€', defaultLanguage: 'de', timezone: 'Europe/Berlin', supportedPayments: ['STRIPE', 'PAYPAL', 'SOFORT'], supportedMarketplaces: ['AMAZON', 'EBAY'], shippingProviders: ['DHL'] },
  { code: 'FR', name: 'France', currency: 'EUR', currencySymbol: '€', defaultLanguage: 'fr', timezone: 'Europe/Paris', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON'], shippingProviders: ['LA POSTE'] },
  { code: 'IT', name: 'Italy', currency: 'EUR', currencySymbol: '€', defaultLanguage: 'it', timezone: 'Europe/Rome', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON'], shippingProviders: ['POSTE ITALIANE'] },
  { code: 'ES', name: 'Spain', currency: 'EUR', currencySymbol: '€', defaultLanguage: 'es', timezone: 'Europe/Madrid', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON'], shippingProviders: ['CORREOS'] },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', currencySymbol: '€', defaultLanguage: 'nl', timezone: 'Europe/Amsterdam', supportedPayments: ['STRIPE', 'PAYPAL', 'IDEAL'], supportedMarketplaces: ['AMAZON'], shippingProviders: ['POSTNL'] },
  { code: 'PL', name: 'Poland', currency: 'PLN', currencySymbol: 'zł', defaultLanguage: 'pl', timezone: 'Europe/Warsaw', supportedPayments: ['STRIPE', 'PAYPAL', 'BLIK'], supportedMarketplaces: ['ALLEGRO'], shippingProviders: ['INPOST'] },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', currencySymbol: 'CHF', defaultLanguage: 'de', timezone: 'Europe/Zurich', supportedPayments: ['STRIPE', 'PAYPAL', 'TWINT'], supportedMarketplaces: ['DIGITEC'], shippingProviders: ['SWISS POST'] },
  { code: 'AT', name: 'Austria', currency: 'EUR', currencySymbol: '€', defaultLanguage: 'de', timezone: 'Europe/Vienna', supportedPayments: ['STRIPE', 'PAYPAL', 'EPS'], supportedMarketplaces: ['AMAZON'], shippingProviders: ['DHL'] },
  { code: 'CN', name: 'China', currency: 'CNY', currencySymbol: '¥', defaultLanguage: 'zh', timezone: 'Asia/Shanghai', supportedPayments: ['ALIPAY', 'WECHAT'], supportedMarketplaces: ['TAOBAO', 'TEMU'], shippingProviders: ['SF EXPRESS'] },
  { code: 'JP', name: 'Japan', currency: 'JPY', currencySymbol: '¥', defaultLanguage: 'ja', timezone: 'Asia/Tokyo', supportedPayments: ['STRIPE', 'PAYPAY'], supportedMarketplaces: ['RAKUTEN', 'AMAZON'], shippingProviders: ['YAMATO'] },
  { code: 'KR', name: 'South Korea', currency: 'KRW', currencySymbol: '₩', defaultLanguage: 'ko', timezone: 'Asia/Seoul', supportedPayments: ['NICEPAY'], supportedMarketplaces: ['COUPANG'], shippingProviders: ['CJ LOGISTICS'] },
  { code: 'SG', name: 'Singapore', currency: 'SGD', currencySymbol: 'S$', defaultLanguage: 'en', timezone: 'Asia/Singapore', supportedPayments: ['STRIPE', 'GRABPAY'], supportedMarketplaces: ['SHOPEE', 'LAZADA'], shippingProviders: ['SINGAPORE POST'] },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', currencySymbol: 'RM', defaultLanguage: 'ms', timezone: 'Asia/Kuala_Lumpur', supportedPayments: ['STRIPE', 'TOUCHNGO'], supportedMarketplaces: ['SHOPEE', 'LAZADA'], shippingProviders: ['POS MALAYSIA'] },
  { code: 'TH', name: 'Thailand', currency: 'THB', currencySymbol: '฿', defaultLanguage: 'th', timezone: 'Asia/Bangkok', supportedPayments: ['STRIPE', 'PROMPTPAY'], supportedMarketplaces: ['SHOPEE', 'LAZADA'], shippingProviders: ['THAILAND POST'] },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', currencySymbol: 'Rp', defaultLanguage: 'id', timezone: 'Asia/Jakarta', supportedPayments: ['STRIPE', 'OVO', 'GOPAY'], supportedMarketplaces: ['SHOPEE', 'TOKOPEDIA'], shippingProviders: ['JNE'] },
  { code: 'IN', name: 'India', currency: 'INR', currencySymbol: '₹', defaultLanguage: 'hi', timezone: 'Asia/Kolkata', supportedPayments: ['STRIPE', 'PAYTM', 'UPI'], supportedMarketplaces: ['FLIPKART', 'AMAZON'], shippingProviders: ['DELHIVERY'] },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', currencySymbol: '₨', defaultLanguage: 'ur', timezone: 'Asia/Karachi', supportedPayments: ['JAZZCASH', 'EASYPASA'], supportedMarketplaces: ['DARAZ'], shippingProviders: ['TCS'] },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', currencySymbol: '৳', defaultLanguage: 'bn', timezone: 'Asia/Dhaka', supportedPayments: ['BKASH'], supportedMarketplaces: ['DARAZ'], shippingProviders: ['PATH AO'] },
  { code: 'BR', name: 'Brazil', currency: 'BRL', currencySymbol: 'R$', defaultLanguage: 'pt', timezone: 'America/Sao_Paulo', supportedPayments: ['STRIPE', 'PIX', 'MERCADOPAGO'], supportedMarketplaces: ['MERCADOLIBRE'], shippingProviders: ['CORREIOS'] },
  { code: 'AR', name: 'Argentina', currency: 'ARS', currencySymbol: 'ARS$', defaultLanguage: 'es', timezone: 'America/Argentina/Buenos_Aires', supportedPayments: ['MERCADOPAGO'], supportedMarketplaces: ['MERCADOLIBRE'], shippingProviders: ['CORREO ARGENTINO'] },
  { code: 'CO', name: 'Colombia', currency: 'COP', currencySymbol: 'COL$', defaultLanguage: 'es', timezone: 'America/Bogota', supportedPayments: ['MERCADOPAGO'], supportedMarketplaces: ['MERCADOLIBRE'], shippingProviders: ['4-72'] },
  { code: 'CL', name: 'Chile', currency: 'CLP', currencySymbol: 'CLP$', defaultLanguage: 'es', timezone: 'America/Santiago', supportedPayments: ['MERCADOPAGO'], supportedMarketplaces: ['MERCADOLIBRE'], shippingProviders: ['CORREOS DE CHILE'] },
  { code: 'PE', name: 'Peru', currency: 'PEN', currencySymbol: 'S/', defaultLanguage: 'es', timezone: 'America/Lima', supportedPayments: ['MERCADOPAGO'], supportedMarketplaces: ['MERCADOLIBRE'], shippingProviders: ['SERPOST'] },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', currencySymbol: 'R', defaultLanguage: 'en', timezone: 'Africa/Johannesburg', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['TAKEALOT'], shippingProviders: ['SAPO'] },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', currencySymbol: '₦', defaultLanguage: 'en', timezone: 'Africa/Lagos', supportedPayments: ['PAYSTACK', 'FLUTTERWAVE'], supportedMarketplaces: ['JUMIA'], shippingProviders: ['DHL'] },
  { code: 'KE', name: 'Kenya', currency: 'KES', currencySymbol: 'KSh', defaultLanguage: 'en', timezone: 'Africa/Nairobi', supportedPayments: ['MPESA', 'STRIPE'], supportedMarketplaces: ['JUMIA'], shippingProviders: ['DHL'] },
  { code: 'EG', name: 'Egypt', currency: 'EGP', currencySymbol: 'E£', defaultLanguage: 'ar', timezone: 'Africa/Cairo', supportedPayments: ['PAYMOB'], supportedMarketplaces: ['JUMIA'], shippingProviders: ['ARAMEX'] },
  { code: 'AU', name: 'Australia', currency: 'AUD', currencySymbol: 'A$', defaultLanguage: 'en', timezone: 'Australia/Sydney', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON', 'EBAY'], shippingProviders: ['AUSTRALIA POST'] },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', currencySymbol: 'NZ$', defaultLanguage: 'en', timezone: 'Pacific/Auckland', supportedPayments: ['STRIPE', 'PAYPAL'], supportedMarketplaces: ['AMAZON'], shippingProviders: ['NZ POST'] },
];

export function getCountryConfig(code: string): CountryConfig | undefined {
  const cc = code.toUpperCase();
  return MARKETPLACE_COUNTRIES.find((c) => c.code === cc);
}

// compile-time fallback — the static catalog is always non-empty (see the
// array above), so the Default Country is guaranteed to be present.
const FALLBACK_COUNTRY: CountryConfig = MARKETPLACE_COUNTRIES.find(
  (c) => c.code === DEFAULT_COUNTRY_CODE,
) as CountryConfig;

export function getCountryConfigOrFallback(code?: string): CountryConfig {
  if (code === undefined) return FALLBACK_COUNTRY;
  return getCountryConfig(code) ?? FALLBACK_COUNTRY;
}
// ---------------------------------------------------------------------------
// DTOs — shared across the API and client apps (web / admin / mobile).
// Money is always exposed as a decimal string (JSON cannot carry BigInt).
// ---------------------------------------------------------------------------

export interface MarketplaceProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMinor: string;
  originalPriceMinor: string | null;
  currency: string;
  category?: { id: string; slug: string; name: string } | null;
  supplier?: { id: string; companyName: string; countryCode: string } | null;
  rating: number;
  ratingCount: number;
  images: string[];
  shippingCountries: string[];
  shippingCostMinor: string;
  estimatedDeliveryDays: string | null;
  source: string;
  isActive: boolean;
}

export interface SupplierSummary {
  id: string;
  companyName: string;
  countryCode: string;
  city: string | null;
  approvalRating: number;
  productCategories: string[];
  status: string;
  logoUrl: string | null;
}

export interface AffiliateSummary {
  id: string;
  fullName: string;
  code: string;
  countryCode: string;
  status: string;
  riskScore: number;
}

export interface TaskDTO {
  id: string;
  provider: string;
  title: string;
  description: string | null;
  taskType: string;
  rewardMinor: string;
  currency: string;
  estimatedMinutes: number;
  countryAvailability: string[];
  deviceCompatibility: string[];
}

export interface OfferDTO {
  id: string;
  provider: string;
  title: string;
  description: string | null;
  rewardMinor: string;
  currency: string;
  estimatedMinutes: number;
  countryAvailability: string[];
  deviceCompatibility: string[];
  url: string | null;
}

export interface PayoutDTO {
  id: string;
  amountMinor: string;
  currency: string;
  method: string;
  destination: string | null;
  status: string;
  createdAt: string;
}

export interface CommissionSummary {
  amountMinor: string;
  currency: string;
  rateType: string;
  rateValue: string;
  status: string;
}

/** Format minor-unit money as a decimal string, e.g. `12.50 USD`. */
export function formatMoney(minor: string | bigint | number, currency: string): string {
  const big = typeof minor === 'bigint' ? minor : BigInt(String(minor) || '0');
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${neg ? '-' : ''}${whole.toString()}.${cents.toString().padStart(2, '0')} ${currency}`;
}