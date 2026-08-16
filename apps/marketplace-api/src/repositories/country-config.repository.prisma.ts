import type { PrismaClient } from '../generated/prisma-client/index.js';
import type { CountryConfig, CountryConfigRepository } from '@marketplace/country';

/**
 * Real, Postgres-backed CountryConfigRepository implementing the exact
 * interface exported by @marketplace/country. Never exercised against a
 * live database in this sandbox (see docs/marketplace/DEBT.md) — only
 * `prisma validate`/`prisma generate` were run for real.
 */
export class PrismaCountryConfigRepository implements CountryConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<CountryConfig[]> {
    const rows = await this.prisma.countryConfig.findMany();
    return rows.map(toCountryConfig);
  }

  async findByCode(code: string): Promise<CountryConfig | null> {
    const row = await this.prisma.countryConfig.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    return row ? toCountryConfig(row) : null;
  }
}

interface PrismaCountryConfigRow {
  code: string;
  name: string;
  nativeName: string | null;
  currency: string;
  currencySymbol: string;
  defaultLanguage: string;
  timezone: string;
  isActive: boolean;
  supportedPayments: unknown;
  supportedMarketplaces: unknown;
  shippingProviders: unknown;
  restrictedCategorySlugs: unknown;
}

function toCountryConfig(row: PrismaCountryConfigRow): CountryConfig {
  return {
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    currency: row.currency,
    currencySymbol: row.currencySymbol,
    defaultLanguage: row.defaultLanguage,
    timezone: row.timezone,
    isActive: row.isActive,
    supportedPayments: asStringArray(row.supportedPayments),
    supportedMarketplaces: asStringArray(row.supportedMarketplaces),
    shippingProviders: asStringArray(row.shippingProviders),
    restrictedCategorySlugs: asStringArray(row.restrictedCategorySlugs),
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
