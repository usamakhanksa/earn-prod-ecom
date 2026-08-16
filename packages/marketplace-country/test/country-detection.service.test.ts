import { describe, expect, it } from 'vitest';
import { CountryDetectionService } from '../src/detection/country-detection.service.js';
import { CountryConfigService } from '../src/config/country-config.service.js';
import { MockCountryConfigRepository } from '../src/config/country-config.repository.mock.js';
import { MockGeolocationProvider } from '../src/geolocation/mock-geolocation.provider.js';

function buildService(fixedGeoCountry = 'DE') {
  const configService = new CountryConfigService(new MockCountryConfigRepository());
  const geoProvider = new MockGeolocationProvider(fixedGeoCountry);
  return new CountryDetectionService(configService, geoProvider);
}

describe('CountryDetectionService — layered resolution order', () => {
  it('1. prefers the user profile country over every other signal', async () => {
    const service = buildService('DE');
    const result = await service.detect({
      userProfileCountry: 'SA',
      userSelectedCountry: 'GB',
      browserLocale: 'en-US',
      ipAddress: '203.0.113.5',
    });
    expect(result.countryCode).toBe('SA');
    expect(result.currency).toBe('SAR');
  });

  it('2. falls back to the user-selected override when there is no profile country', async () => {
    const service = buildService('DE');
    const result = await service.detect({
      userProfileCountry: null,
      userSelectedCountry: 'GB',
      browserLocale: 'en-US',
      ipAddress: '203.0.113.5',
    });
    expect(result.countryCode).toBe('GB');
    expect(result.currency).toBe('GBP');
  });

  it('3. falls back to the browser locale region when there is no profile/override', async () => {
    const service = buildService('DE');
    const result = await service.detect({
      browserLocale: 'en-AU',
      ipAddress: '203.0.113.5',
    });
    expect(result.countryCode).toBe('AU');
  });

  it('4. falls back to IP geolocation when locale carries no usable region', async () => {
    const service = buildService('BR');
    const result = await service.detect({
      browserLocale: 'en', // no region subtag
      ipAddress: '203.0.113.5',
    });
    expect(result.countryCode).toBe('BR');
  });

  it('5. falls back to the default fallback country when nothing else resolves', async () => {
    const service = buildService('DE');
    const result = await service.detect({});
    expect(result.countryCode).toBe('US');
  });

  it('skips a layer whose value is an unknown/unsupported country code', async () => {
    const service = buildService('DE');
    const result = await service.detect({
      userProfileCountry: 'ZZ', // unknown — must be skipped, not trusted
      userSelectedCountry: 'PK',
    });
    expect(result.countryCode).toBe('PK');
  });

  it('returns exactly the required shape: countryCode, countryName, currency, language, timezone', async () => {
    const service = buildService('DE');
    const result = await service.detect({ userSelectedCountry: 'NG' });
    expect(result).toEqual({
      countryCode: 'NG',
      countryName: 'Nigeria',
      currency: 'NGN',
      language: 'en',
      timezone: 'Africa/Lagos',
    });
  });

  it('does not call geolocation at all once an earlier layer already resolved', async () => {
    let calls = 0;
    const configService = new CountryConfigService(new MockCountryConfigRepository());
    const countingProvider = {
      id: 'counting-mock',
      async lookup(_ip: string) {
        calls += 1;
        return { countryCode: 'DE' };
      },
    };
    const service = new CountryDetectionService(configService, countingProvider);
    await service.detect({ userSelectedCountry: 'GB', ipAddress: '203.0.113.5' });
    expect(calls).toBe(0);
  });
});
