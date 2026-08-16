import { CountryConfigService } from '@marketplace/country';
import { env } from '../env.js';
import { createCountryConfigRepository, createProductRepository } from '../repositories/repository-factory.js';
import { MockMarketplaceProvider } from './mock-marketplace.provider.js';
import { CJDropshippingProvider } from './cj-dropshipping.provider.js';
import type { MarketplaceProvider } from './marketplace-provider.js';

/**
 * Single place that decides which `MarketplaceProvider`s are active —
 * mirrors the discipline of `repositories/repository-factory.ts`. Per the
 * spec's own explicit warning, this NEVER assumes every provider is
 * equally available:
 *   - `MockMarketplaceProvider` (this marketplace's own catalog) is always
 *     available — it has no external credential dependency.
 *   - `CJDropshippingProvider` is only included once `CJ_API_KEY` is
 *     actually set. In this sandbox that is never true (see
 *     docs/marketplace/DEBT.md) — no real key was ever available — so the
 *     registry always resolves to `[MockMarketplaceProvider]` here, but the
 *     code path for a configured CJ provider is real and exercised by unit
 *     tests that assert it throws `ProviderNotConfiguredError` until a key
 *     exists.
 */
export class MarketplaceProviderRegistry {
  constructor(private readonly providers: MarketplaceProvider[]) {}

  /** Every provider currently usable (has whatever credentials it needs). */
  list(): MarketplaceProvider[] {
    return this.providers;
  }

  /** The provider searches/lookups should prefer — the internal catalog, when available. */
  primary(): MarketplaceProvider {
    const primary = this.providers[0];
    if (!primary) {
      throw new Error('MarketplaceProviderRegistry has no configured providers at all.');
    }
    return primary;
  }
}

let registrySingleton: MarketplaceProviderRegistry | null = null;

export function createMarketplaceProviderRegistry(): MarketplaceProviderRegistry {
  if (registrySingleton) return registrySingleton;

  const countryConfigService = new CountryConfigService(createCountryConfigRepository());
  const providers: MarketplaceProvider[] = [
    new MockMarketplaceProvider(createProductRepository(), countryConfigService),
  ];

  // Gated on BOTH signals, per the spec's explicit warning not to assume
  // every provider is equally available: MOCK_MODE=true means "this is a
  // sandbox with no real integrations" regardless of whether a stray
  // CJ_API_KEY happens to be set, and even with MOCK_MODE=false the CJ
  // provider is only included once real credentials actually exist.
  if (!env.MOCK_MODE && env.CJ_API_KEY) {
    providers.push(
      new CJDropshippingProvider({
        apiKey: env.CJ_API_KEY,
        email: env.CJ_API_EMAIL,
        baseUrl: env.CJ_API_BASE_URL ?? 'https://developers.cjdropshipping.com/api2.0/v1',
      }),
    );
  }

  registrySingleton = new MarketplaceProviderRegistry(providers);
  return registrySingleton;
}
