import 'dotenv/config';
import { z } from 'zod';

/**
 * Zod-validated environment loader. MOCK_MODE is the load-bearing flag for
 * this phase: when true (the default, and the actual state of this
 * sandbox — no live MARKETPLACE_DATABASE_URL/IP_GEOLOCATION_API_KEY are
 * configured), every repository/provider resolves to its in-memory mock
 * implementation instead of failing to boot.
 */
const boolFromEnv = z
  .union([z.literal('true'), z.literal('false'), z.literal(''), z.undefined()])
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  MOCK_MODE: boolFromEnv.default('true'),
  MARKETPLACE_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(1).optional(),
  MARKETPLACE_WEB_URL: z.string().default('http://localhost:3100'),
  IP_GEOLOCATION_API_KEY: z.string().optional(),
  CJ_API_KEY: z.string().optional(),
  CJ_API_BASE_URL: z.string().optional(),
  // CJDropshippingProvider's (unverified — see docs/marketplace/DEBT.md)
  // getAccessToken request shape needs an account email alongside the API
  // key. Optional here since MOCK_MODE never uses it.
  CJ_API_EMAIL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration — see printed field errors above.');
}

const DEV_ONLY_JWT_SECRET_FALLBACK = 'mock-mode-dev-only-jwt-secret-do-not-use-in-production';

let jwtSecret = parsed.data.JWT_SECRET;
if (!jwtSecret) {
  if (parsed.data.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when NODE_ENV=production.');
  }
  jwtSecret = DEV_ONLY_JWT_SECRET_FALLBACK;
  // eslint-disable-next-line no-console
  console.warn(
    '[env] JWT_SECRET is not set — using a fixed development-only fallback. ' +
      'Set JWT_SECRET in .env before anything resembling production.',
  );
}

export const env = {
  ...parsed.data,
  JWT_SECRET: jwtSecret,
  /** True when there's no real Postgres connection string to use. */
  hasRealDatabase: Boolean(parsed.data.MARKETPLACE_DATABASE_URL) && !parsed.data.MOCK_MODE,
  /** True when a real geolocation vendor key has been supplied. */
  hasRealGeolocation: Boolean(parsed.data.IP_GEOLOCATION_API_KEY) && !parsed.data.MOCK_MODE,
};

export type Env = typeof env;
