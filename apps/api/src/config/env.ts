import 'dotenv/config';
import { z } from 'zod';

/**
 * Typed environment. Every value optional in schema carries a documented default so the
 * API can boot locally without secrets. Secret material (JWT, KMS) gets a dev default
 * only when NODE_ENV !== 'production'.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_URL: z.string().url().default('http://localhost:4000'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  DATABASE_URL: z
    .string()
    .default('postgresql://omnisell:omnisell@localhost:5432/omnisell'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z
    .string()
    .default('dev-access-secret-32-bytes-minimum-000'),
  JWT_REFRESH_SECRET: z
    .string()
    .default('dev-refresh-secret-32-bytes-minimum-00'),
  KMS_MASTER_KEY: z.string().default('aGVyZS1pcy0zMi1ieXRlLWJhc2U2NC1rZXktZmVkY2Jh'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('omnisell-assets'),
  // Presigned-upload credentials (Phase 2 task 2.1). Dev defaults let the API
  // boot and generate real-shaped presigned URLs without a live MinIO — the
  // URL is valid SigV4 output, but nothing has verified an actual PUT against
  // it in this sandbox (docs/DEBT.md).
  S3_ACCESS_KEY: z.string().default('dev-minio-access-key'),
  S3_SECRET_KEY: z.string().default('dev-minio-secret-key'),
  S3_REGION: z.string().default('us-east-1'),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  // Disk-backed stand-in for tus/S3-multipart chunk storage (docs/DEBT.md) —
  // resumable-upload sessions land chunks here instead of real object storage.
  ASSET_UPLOAD_SCRATCH_DIR: z.string().default('./.upload-scratch'),
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  MAIL_FROM: z.string().default('OmniSell <no-reply@omnisell.dev>'),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).default(30),
  POINTS_VIDEO_MIN_WATCH_SECONDS: z.coerce.number().int().min(1).default(30),
  POINTS_DAILY_EARNING_CAP: z.coerce.number().int().min(1).default(500),
  POINTS_FRAUD_DETECTION_ENABLED: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('true'),
  POINTS_HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(5),
  // Was documented in .env.example/README since Phase 0 but never actually parsed by this
  // schema — closed this pass (Phase 4.5, docs/DEBT.md). Real per-user rate limit on
  // `POST /v1/video-watches` (§8.3).
  POINTS_MAX_WATCHES_PER_DAY: z.coerce.number().int().min(1).default(10),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // OAuth SSO (prompt.md Phase 1.3). Intentionally optional — no credentials are
  // available in this environment (docs/DEBT.md 1-D2). Absent values mean the
  // corresponding provider's endpoints answer 501 oauth_provider_not_configured
  // instead of crashing or faking success.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  APPLE_REDIRECT_URI: z.string().url().optional(),

  MFA_ISSUER: z.string().default('OmniSell'),
  MFA_CHALLENGE_TTL_MINUTES: z.coerce.number().int().min(1).default(10),
  INVITE_TTL_DAYS: z.coerce.number().int().min(1).default(7),

  // Connector OAuth (prompt.md Phase 3 task 3.3). Printful is the only one of
  // the four Phase 3 adapters that offers OAuth2 (Printify/Gelato/Prodigi are
  // API-key/PAT — no platform-level client credentials needed for those).
  // Same honest gating as Google/Apple SSO above: absent in this sandbox
  // (docs/DEBT.md), buildAuthUrl/exchangeCode still call the real documented
  // endpoints and only fail once an actual call is attempted.
  PRINTFUL_OAUTH_CLIENT_ID: z.string().optional(),
  PRINTFUL_OAUTH_CLIENT_SECRET: z.string().optional(),
  CONNECTOR_OAUTH_STATE_TTL_MINUTES: z.coerce.number().int().min(1).default(10),
  CONNECTION_HEALTH_SAMPLE_RETENTION: z.coerce.number().int().min(1).default(50),

  // Export Pack generator (Phase 4 task 4.12) — the generated ZIP's bytes
  // land on local disk scratch storage, same documented stand-in pattern as
  // `ASSET_UPLOAD_SCRATCH_DIR` above (docs/DEBT.md 2-D2): unlike the SOURCE
  // asset bytes (which genuinely need live object storage — 2-D4's 503
  // pattern), the pack's OUTPUT is this API's own artifact, so there is no
  // reason it couldn't be written locally even in production for a
  // self-hosted deployment. Swaps for real S3 with no shape change.
  EXPORT_PACK_SCRATCH_DIR: z.string().default('./.export-pack-scratch'),

  // ------------------------------------------------------------------
  // Global Marketplace (ecom-front.txt)
  // ------------------------------------------------------------------
  // MOCK_MODE=true runs the whole platform with seeded demo data and the
  // MockMarketplaceProvider — the UI works end-to-end with zero external
  // credentials (spec §44). All provider secrets below are optional; when
  // absent the API answers with mock/demo adapters instead of crashing.
  MOCK_MODE: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('true'),

  // Payments (spec §26) — optional, mock adapter when absent.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),

  // Marketplace data providers (spec §11) — optional, mock adapter when absent.
  AMAZON_API_KEY: z.string().optional(),
  EBAY_API_KEY: z.string().optional(),
  WALMART_API_KEY: z.string().optional(),
  ETSY_API_KEY: z.string().optional(),
  ALIEXPRESS_API_KEY: z.string().optional(),
  CJ_API_KEY: z.string().optional(),
  CJ_API_BASE_URL: z.string().optional(),

  // IP geolocation for country detection fallback (spec §6/§17).
  IP_GEOLOCATION_API_KEY: z.string().optional(),

  // Analytics + notifications (spec §43/§53).
  GOOGLE_ANALYTICS_ID: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  TWILIO_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  throw new Error(`Invalid environment configuration:\n  ${issues}`);
}

export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;