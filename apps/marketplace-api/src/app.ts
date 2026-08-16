import express, { type Express, type RequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { healthRouter } from './modules/health/health.router.js';
import { authRouter } from './modules/auth/auth.router.js';
import { countryRouter, countriesRouter } from './modules/country/country.router.js';
import { productsRouter } from './modules/products/products.router.js';
import { categoriesRouter } from './modules/categories/categories.router.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: env.MARKETPLACE_WEB_URL,
      credentials: true,
    }),
  );
  app.use(express.json());
  // Cast: the hoisted root node_modules (this app's own @types/express is
  // pinned to v4, but a sibling package elsewhere in this monorepo pulls
  // in @types/express@5's express-serve-static-core as a transitive type
  // dependency of @types/cookie-parser) makes cookie-parser's inferred
  // RequestHandler generic resolve against the wrong major version's
  // types at the call site. The runtime is unaffected — cookie-parser is
  // a plain Express 4 middleware — this is a types-only cross-package
  // version-skew glitch from the root .npmrc's hoisted linker.
  app.use(cookieParser() as unknown as RequestHandler);

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/country', countryRouter);
  app.use('/api/countries', countriesRouter);
  // Mounted under /api, matching the existing auth/country convention
  // (the spec writes these as "GET /products" etc. without a prefix, but
  // every other route in this app already lives under /api/* — kept
  // consistent rather than introducing a second, unprefixed route family).
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);

  app.use(errorHandler);

  return app;
}
