import en from './locales/en.json';
import ar from './locales/ar.json';

export type Locale = 'en' | 'ar';

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar']);

export const LOCALES: readonly Locale[] = ['en', 'ar'];

export type TranslationKey = keyof typeof en;

export interface Messages {
  [key: string]: string;
}

export const messagesByLocale: Record<Locale, Messages> = {
  en: en as Messages,
  ar: ar as Messages,
};

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function dirForLocale(locale: Locale): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/**
 * Resolve a translation key with `{param}` interpolation.
 * Missing keys return the key itself so the UI degrades visibly instead of crashing.
 */
export function translate(
  messages: Messages,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = messages[key];
  if (template === undefined) {
    return key;
  }
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** CUR evaluation helper returning a bound t() for a locale. */
export function createTranslator(locale: Locale) {
  const messages = messagesByLocale[locale] ?? en;
  return {
    locale,
    dir: dirForLocale(locale),
    t: (key: string, params?: Record<string, string | number>) => translate(messages, key, params),
  };
}