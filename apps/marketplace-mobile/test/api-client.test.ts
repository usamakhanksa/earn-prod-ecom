import { describe, expect, it, afterEach } from 'vitest';
import { resolveApiBaseUrl } from '../lib/api-client';

describe('resolveApiBaseUrl', () => {
  const original = process.env.EXPO_PUBLIC_MARKETPLACE_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_MARKETPLACE_API_URL = original;
  });

  it('defaults to localhost:4100 when EXPO_PUBLIC_MARKETPLACE_API_URL is unset', () => {
    delete process.env.EXPO_PUBLIC_MARKETPLACE_API_URL;
    expect(resolveApiBaseUrl()).toBe('http://localhost:4100');
  });

  it('reads EXPO_PUBLIC_MARKETPLACE_API_URL when set', () => {
    process.env.EXPO_PUBLIC_MARKETPLACE_API_URL = 'https://staging.example.com';
    expect(resolveApiBaseUrl()).toBe('https://staging.example.com');
  });
});
