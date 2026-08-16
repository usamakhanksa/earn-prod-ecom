import { describe, expect, it } from 'vitest';
import { CJDropshippingProvider } from '../src/providers/cj-dropshipping.provider.js';
import { ProviderNotConfiguredError } from '../src/providers/marketplace-provider.js';

/**
 * CJDropshippingProvider was never exercised against a live CJ Dropshipping
 * account in this build — there is no real CJ_API_KEY available in this
 * sandbox (see docs/marketplace/DEBT.md). What IS real and testable here:
 * the "not configured" gate — every method must refuse to make a network
 * call and throw a clear error instead, exactly like OmniSell's own
 * connector adapters do for missing credentials.
 */
describe('CJDropshippingProvider — unconfigured (no CJ_API_KEY, the actual state of this sandbox)', () => {
  const provider = new CJDropshippingProvider({
    apiKey: undefined,
    baseUrl: 'https://developers.cjdropshipping.com/api2.0/v1',
  });

  it('reports itself as not configured', () => {
    expect(provider.isConfigured).toBe(false);
  });

  it('rejects searchProducts with ProviderNotConfiguredError', async () => {
    await expect(provider.searchProducts({ page: 1, limit: 10 })).rejects.toThrow(
      ProviderNotConfiguredError,
    );
  });

  it('rejects getProduct with ProviderNotConfiguredError', async () => {
    await expect(provider.getProduct('anything')).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('rejects getCategories with ProviderNotConfiguredError', async () => {
    await expect(provider.getCategories()).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('rejects getAvailability with ProviderNotConfiguredError', async () => {
    await expect(provider.getAvailability('p1', 'US')).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('rejects getPricing with ProviderNotConfiguredError', async () => {
    await expect(provider.getPricing('p1', 'US')).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('rejects getShipping with ProviderNotConfiguredError', async () => {
    await expect(provider.getShipping('p1', 'US')).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('the error message names the missing env var, not a vague failure', async () => {
    await expect(provider.getProduct('anything')).rejects.toThrow(/CJ_API_KEY/);
  });
});

describe('CJDropshippingProvider — configured (a fake key; still never makes a real network call in tests)', () => {
  it('reports itself as configured once an apiKey is present', () => {
    const provider = new CJDropshippingProvider({
      apiKey: 'test-only-fake-key-never-a-real-credential',
      baseUrl: 'https://developers.cjdropshipping.com/api2.0/v1',
    });
    expect(provider.isConfigured).toBe(true);
  });
});
