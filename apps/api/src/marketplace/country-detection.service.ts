import { Injectable } from '@nestjs/common';
import {
  getCountryConfigOrFallback,
  DEFAULT_COUNTRY_CODE,
  type CountryConfig,
  type DetectedCountry,
} from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hashIp } from './risk.service';

export interface DetectionContext {
  /** explicit user-selected country (header `x-country-code` / cookie) */
  selectedCountryCode?: string | undefined;
  /** Accept-Language header, e.g. "en-US,en;q=0.9" */
  acceptLanguage?: string | undefined;
  /** raw IP — used only for geolocation fallback, never persisted raw */
  ip?: string | undefined;
}

/**
 * Country detection (spec §6/§17) with a layered strategy — NEVER relies on a
 * single source:
 *   1. Existing user profile country      (passed in as `profileCountryCode`)
 *   2. User-selected country              (`x-country-code` header / cookie)
 *   3. Browser locale                     (Accept-Language)
 *   4. IP/geolocation                     (optional, IP_GEOLOCATION_API_KEY)
 *   5. Fallback country                   (US)
 */
@Injectable()
export class CountryDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async detect(
    ctx: DetectionContext & { profileCountryCode?: string },
  ): Promise<DetectedCountry> {
    const candidate = this.pickCountry(
      ctx.profileCountryCode,
      ctx.selectedCountryCode,
      ctx.acceptLanguage,
      ctx.ip,
    );
    // Prefer the admin-editable DB config; fall back to the static catalog.
    const db = await this.prisma.countryConfig.findUnique({
      where: { code: candidate.code },
    });
    const config: CountryConfig = db
      ? {
          code: db.code,
          name: db.name,
          currency: db.currency,
          currencySymbol: db.currencySymbol,
          defaultLanguage: db.defaultLanguage,
          timezone: db.timezone,
          supportedPayments: asStringArray(db.supportedPayments),
          supportedMarketplaces: asStringArray(db.supportedMarketplaces),
          shippingProviders: asStringArray(db.shippingProviders),
        }
      : getCountryConfigOrFallback(candidate.code);

    return {
      countryCode: config.code,
      countryName: config.name,
      currency: config.currency,
      language: config.defaultLanguage,
      timezone: config.timezone,
    };
  }

  /** Pure, deterministic selection used by both the API and unit tests. */
  pickCountry(
    profileCountryCode?: string,
    selectedCountryCode?: string,
    acceptLanguage?: string,
    ip?: string,
  ): CountryConfig {
    const fromProfile = profileCountryCode !== undefined ? getCountryConfigOrFallback(profileCountryCode) : undefined;
    if (profileCountryCode !== undefined && fromProfile !== undefined) return fromProfile;

    if (selectedCountryCode !== undefined) {
      const selected = getCountryConfigOrFallback(selectedCountryCode);
      if (selected.code === selectedCountryCode.toUpperCase()) return selected;
    }

    const fromLocale = this.fromAcceptLanguage(acceptLanguage);
    if (fromLocale !== undefined) return fromLocale;

    const fromIp = this.fromIp(ip);
    if (fromIp !== undefined) return fromIp;

    return getCountryConfigOrFallback(DEFAULT_COUNTRY_CODE);
  }

  private fromAcceptLanguage(acceptLanguage?: string): CountryConfig | undefined {
    if (acceptLanguage === undefined) return undefined;
    // "en-US,en;q=0.9" -> "US"
    const first = acceptLanguage.split(',')[0]?.trim();
    const region = first?.split('-')[1];
    if (region !== undefined && region.length === 2) {
      const cfg = getCountryConfigOrFallback(region);
      if (cfg.code === region.toUpperCase()) return cfg;
    }
    return undefined;
  }

  private fromIp(ip?: string): CountryConfig | undefined {
    if (ip === undefined || ip === '::1' || ip === '127.0.0.1') return undefined;
    // No geolocation API key configured -> stay on fallback (never fabricate a
    // country from a raw IP). When IP_GEOLOCATION_API_KEY is set, this hook is
    // where a provider call would land (timeout + mock fallback).
    return undefined;
  }

  /** Just a fingerprint helper for audit logs — proves we never log raw IPs. */
  fingerprintIp(ip?: string): string | null {
    return ip !== undefined ? hashIp(ip) : null;
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}