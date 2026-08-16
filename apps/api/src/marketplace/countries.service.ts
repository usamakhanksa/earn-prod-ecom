import { Injectable, NotFoundException } from '@nestjs/common';
import { MARKETPLACE_COUNTRIES, type CountryConfig } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CountryDetectionService, type DetectionContext } from './country-detection.service';

/**
 * Countries service (spec §7/§28 admin country management). Reads the
 * admin-editable `CountryConfig` table; falls back to the static catalog in
 * MOCK_MODE or when the table is empty (fresh DB before seeding).
 */
@Injectable()
export class CountriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detection: CountryDetectionService,
  ) {}

  async list(): Promise<{ items: CountryConfig[] }> {
    const rows = await this.prisma.countryConfig.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    if (rows.length === 0) {
      return { items: MARKETPLACE_COUNTRIES.map((c) => ({ ...c })) };
    }
    return {
      items: rows.map((r) => ({
        code: r.code,
        name: r.name,
        currency: r.currency,
        currencySymbol: r.currencySymbol,
        defaultLanguage: r.defaultLanguage,
        timezone: r.timezone,
        supportedPayments: asStrings(r.supportedPayments),
        supportedMarketplaces: asStrings(r.supportedMarketplaces),
        shippingProviders: asStrings(r.shippingProviders),
      })),
    };
  }

  async getByCode(code: string): Promise<CountryConfig> {
    const upper = code.toUpperCase();
    const row = await this.prisma.countryConfig.findUnique({ where: { code: upper } });
    if (row !== null) {
      return {
        code: row.code,
        name: row.name,
        currency: row.currency,
        currencySymbol: row.currencySymbol,
        defaultLanguage: row.defaultLanguage,
        timezone: row.timezone,
        supportedPayments: asStrings(row.supportedPayments),
        supportedMarketplaces: asStrings(row.supportedMarketplaces),
        shippingProviders: asStrings(row.shippingProviders),
      };
    }
    const fallback = MARKETPLACE_COUNTRIES.find((c) => c.code === upper);
    if (fallback === undefined) {
      throw new NotFoundException(`Country '${upper}' is not configured`);
    }
    return { ...fallback };
  }

  /** Spec §6 — layered detection, returns the resolved country + helpers. */
  async detect(ctx: DetectionContext & { profileCountryCode?: string }) {
    const detected = await this.detection.detect(ctx);
    return { ...detected, fingerprint: this.detection.fingerprintIp(ctx.ip) };
  }
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}