import { Router } from 'express';
import { countryOverrideInputSchema } from '@marketplace/shared';
import {
  CountryConfigService,
  CountryDetectionService,
  createGeolocationProvider,
} from '@marketplace/country';
import { createCountryConfigRepository } from '../../repositories/repository-factory.js';
import { attachUserIfPresent } from '../../middleware/auth.guard.js';
import { createUserRepository } from '../../repositories/repository-factory.js';
import { env } from '../../env.js';

export const COUNTRY_COOKIE_NAME = 'marketplace_country';

export const countryRouter = Router();

const countryConfigService = new CountryConfigService(createCountryConfigRepository());
const geolocationProvider = createGeolocationProvider();
const countryDetectionService = new CountryDetectionService(
  countryConfigService,
  geolocationProvider,
);
const userRepository = createUserRepository();

/** Best-effort client IP extraction (works behind Express's trust proxy too). */
function extractClientIp(req: import('express').Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? req.ip ?? null;
}

countryRouter.get('/detect', attachUserIfPresent, async (req, res, next) => {
  try {
    let userProfileCountry: string | null = null;
    if (req.user) {
      const user = await userRepository.findById(req.user.sub);
      userProfileCountry = user?.countryCode ?? null;
    }

    const cookieOverride = req.cookies?.[COUNTRY_COOKIE_NAME] ?? null;

    const result = await countryDetectionService.detect({
      userProfileCountry,
      userSelectedCountry: typeof cookieOverride === 'string' ? cookieOverride : null,
      browserLocale: req.headers['accept-language'] ?? null,
      ipAddress: extractClientIp(req),
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

countryRouter.post('/override', async (req, res, next) => {
  try {
    const input = countryOverrideInputSchema.parse(req.body);
    const supported = await countryConfigService.isSupported(input.countryCode);
    if (!supported) {
      res.status(422).json({
        message: `Country "${input.countryCode}" is not supported by this marketplace yet.`,
      });
      return;
    }

    res.cookie(COUNTRY_COOKIE_NAME, input.countryCode, {
      httpOnly: false, // the web client's country switcher reads this to reflect the current choice
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const result = await countryDetectionService.detect({
      userSelectedCountry: input.countryCode,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

const countriesRouter = Router();

countriesRouter.get('/', async (_req, res, next) => {
  try {
    const configs = await countryConfigService.listActive();
    res.status(200).json(
      configs.map((c) => ({
        code: c.code,
        name: c.name,
        nativeName: c.nativeName,
        currency: c.currency,
        currencySymbol: c.currencySymbol,
        defaultLanguage: c.defaultLanguage,
        timezone: c.timezone,
        isActive: c.isActive,
      })),
    );
  } catch (err) {
    next(err);
  }
});

export { countriesRouter };

// Re-exported so the app wiring layer can log which mode is active.
export const countryDetectionMode = env.MOCK_MODE ? 'mock' : 'real';
