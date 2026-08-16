import type { CountryConfig, CountryConfigRepository } from '../types.js';
import { COUNTRY_CONFIG_SEED } from './country-config-data.js';

/**
 * In-memory CountryConfigRepository used when MOCK_MODE=true (i.e. always,
 * in this sandbox, since no live MARKETPLACE_DATABASE_URL is configured).
 * A PrismaCountryConfigRepository implementing the same
 * `CountryConfigRepository` interface lives in
 * apps/marketplace-api/src/repositories and is swapped in by that app's
 * repository factory once a real database is available.
 */
export class MockCountryConfigRepository implements CountryConfigRepository {
  private readonly rows: CountryConfig[];

  constructor(seed: CountryConfig[] = COUNTRY_CONFIG_SEED) {
    this.rows = seed.map((row) => ({ ...row }));
  }

  async findAll(): Promise<CountryConfig[]> {
    return this.rows.map((row) => ({ ...row }));
  }

  async findByCode(code: string): Promise<CountryConfig | null> {
    const normalized = code.trim().toUpperCase();
    const found = this.rows.find((row) => row.code === normalized);
    return found ? { ...found } : null;
  }
}
