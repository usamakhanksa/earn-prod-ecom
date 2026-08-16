import { z } from 'zod';

/**
 * Exact return shape required by the spec for country detection:
 * { countryCode, countryName, currency, language, timezone }
 */
export const countryDetectionResultSchema = z.object({
  countryCode: z.string().length(2),
  countryName: z.string(),
  currency: z.string(),
  language: z.string(),
  timezone: z.string(),
});

export type CountryDetectionResult = z.infer<typeof countryDetectionResultSchema>;

export const countryOverrideInputSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'countryCode must be a 2-letter ISO code'),
});

export type CountryOverrideInput = z.infer<typeof countryOverrideInputSchema>;

export const countryConfigSummarySchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  nativeName: z.string().nullable(),
  currency: z.string(),
  currencySymbol: z.string(),
  defaultLanguage: z.string(),
  timezone: z.string(),
  isActive: z.boolean(),
});

export type CountryConfigSummary = z.infer<typeof countryConfigSummarySchema>;
