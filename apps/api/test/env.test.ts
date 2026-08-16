import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config/env';

describe('env schema', () => {
  it('applies documented defaults', () => {
    const parsed = envSchema.parse({});
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.POINTS_VIDEO_MIN_WATCH_SECONDS).toBe(30);
    expect(parsed.POINTS_FRAUD_DETECTION_ENABLED).toBe(true);
    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('coerces stringified numbers', () => {
    const parsed = envSchema.parse({ API_PORT: '5000', POINTS_DAILY_EARNING_CAP: '250' });
    expect(parsed.API_PORT).toBe(5000);
    expect(parsed.POINTS_DAILY_EARNING_CAP).toBe(250);
  });

  it('rejects invalid ports', () => {
    expect(envSchema.safeParse({ API_PORT: 70000 }).success).toBe(false);
    expect(envSchema.safeParse({ API_PORT: 'nope' }).success).toBe(false);
  });
});