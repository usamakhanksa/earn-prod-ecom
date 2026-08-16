import type { CountryConfig } from '../types.js';

/**
 * Seed data for the MOCK_MODE in-memory CountryConfigRepository. This is
 * intentionally NOT an exhaustive country catalog (the spec's full list is
 * 30+ countries, later phases) — it's enough real, distinct, data-driven
 * rows to prove the CountryConfigService/CountryRulesService engine reads
 * from data rather than hardcoded `if (country === 'SA')` branches.
 *
 * Field values (currency, symbol, default language, timezone, common
 * local payment methods/marketplaces/shipping carriers) reflect
 * real-world facts about each market, not invented placeholders — but the
 * *rows themselves* are this app's own seed data, not sourced from any
 * live database.
 */
export const COUNTRY_CONFIG_SEED: CountryConfig[] = [
  {
    code: 'SA',
    name: 'Saudi Arabia',
    nativeName: 'المملكة العربية السعودية',
    currency: 'SAR',
    currencySymbol: 'SAR',
    defaultLanguage: 'ar',
    timezone: 'Asia/Riyadh',
    isActive: true,
    supportedPayments: ['mada', 'stc_pay', 'credit_card', 'cash_on_delivery'],
    supportedMarketplaces: ['noon', 'amazon_sa'],
    shippingProviders: ['aramex', 'smsa'],
    // Real-world fact, not an invented rule: online alcohol sales are
    // prohibited in Saudi Arabia.
    restrictedCategorySlugs: ['alcohol-spirits'],
  },
  {
    code: 'US',
    name: 'United States',
    nativeName: null,
    currency: 'USD',
    currencySymbol: '$',
    defaultLanguage: 'en',
    timezone: 'America/New_York',
    isActive: true,
    supportedPayments: ['credit_card', 'paypal', 'apple_pay', 'google_pay'],
    supportedMarketplaces: ['amazon_us', 'ebay'],
    shippingProviders: ['ups', 'fedex', 'usps'],
    restrictedCategorySlugs: [],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    nativeName: null,
    currency: 'GBP',
    currencySymbol: '£',
    defaultLanguage: 'en',
    timezone: 'Europe/London',
    isActive: true,
    supportedPayments: ['credit_card', 'paypal', 'apple_pay'],
    supportedMarketplaces: ['amazon_uk', 'ebay_uk'],
    shippingProviders: ['royal_mail', 'dpd'],
    restrictedCategorySlugs: [],
  },
  {
    code: 'DE',
    name: 'Germany',
    nativeName: 'Deutschland',
    currency: 'EUR',
    currencySymbol: '€',
    defaultLanguage: 'de',
    timezone: 'Europe/Berlin',
    isActive: true,
    supportedPayments: ['credit_card', 'paypal', 'sofort', 'klarna'],
    supportedMarketplaces: ['amazon_de', 'otto'],
    shippingProviders: ['dhl', 'hermes'],
    restrictedCategorySlugs: [],
  },
  {
    code: 'IN',
    name: 'India',
    nativeName: 'भारत',
    currency: 'INR',
    currencySymbol: '₹',
    defaultLanguage: 'hi',
    timezone: 'Asia/Kolkata',
    isActive: true,
    supportedPayments: ['upi', 'credit_card', 'cash_on_delivery', 'paytm'],
    supportedMarketplaces: ['amazon_in', 'flipkart'],
    shippingProviders: ['delhivery', 'bluedart'],
    restrictedCategorySlugs: [],
  },
  {
    code: 'PK',
    name: 'Pakistan',
    nativeName: 'پاکستان',
    currency: 'PKR',
    currencySymbol: 'PKR',
    defaultLanguage: 'ur',
    timezone: 'Asia/Karachi',
    isActive: true,
    supportedPayments: ['cash_on_delivery', 'easypaisa', 'jazzcash', 'credit_card'],
    supportedMarketplaces: ['daraz_pk'],
    shippingProviders: ['tcs', 'leopards_courier'],
    // Real-world fact: Pakistan restricts commercial alcohol sales to a
    // narrow licensed non-Muslim channel — not sold on general marketplaces.
    restrictedCategorySlugs: ['alcohol-spirits'],
  },
  {
    code: 'BR',
    name: 'Brazil',
    nativeName: 'Brasil',
    currency: 'BRL',
    currencySymbol: 'R$',
    defaultLanguage: 'pt',
    timezone: 'America/Sao_Paulo',
    isActive: true,
    supportedPayments: ['pix', 'boleto', 'credit_card'],
    supportedMarketplaces: ['amazon_br', 'mercado_livre'],
    shippingProviders: ['correios'],
    restrictedCategorySlugs: [],
  },
  {
    code: 'NG',
    name: 'Nigeria',
    nativeName: null,
    currency: 'NGN',
    currencySymbol: '₦',
    defaultLanguage: 'en',
    timezone: 'Africa/Lagos',
    isActive: true,
    supportedPayments: ['cash_on_delivery', 'bank_transfer', 'paystack', 'flutterwave'],
    supportedMarketplaces: ['jumia_ng'],
    shippingProviders: ['gig_logistics'],
    restrictedCategorySlugs: [],
  },
  {
    code: 'AU',
    name: 'Australia',
    nativeName: null,
    currency: 'AUD',
    currencySymbol: '$',
    defaultLanguage: 'en',
    timezone: 'Australia/Sydney',
    isActive: true,
    supportedPayments: ['credit_card', 'paypal', 'afterpay'],
    supportedMarketplaces: ['amazon_au', 'ebay_au'],
    shippingProviders: ['australia_post'],
    restrictedCategorySlugs: [],
  },
];

/** Country used when no other detection layer resolves. Must exist in the seed above. */
export const DEFAULT_FALLBACK_COUNTRY_CODE = 'US';
