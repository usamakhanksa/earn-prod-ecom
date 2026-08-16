import type { Locale } from '@omnisell/i18n';

/** Formats an integer minor-unit string as a localised currency amount
 * (prompt.md: tabular-nums at the UI layer — callers wrap the result in a
 * `tabular-nums` className, this function only does the number formatting).
 * Falls back to a plain `CUR 12.34` string if `Intl` rejects the currency
 * code (e.g. a not-yet-real ISO code typed into a form). */
export function formatMoneyMinor(amountMinor: string, currency: string, locale: Locale): string {
  const value = Number(amountMinor) / 100;
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
