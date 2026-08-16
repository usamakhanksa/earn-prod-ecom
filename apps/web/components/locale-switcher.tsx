'use client';

import type { Locale } from '@omnisell/i18n';
import { LOCALES } from '@omnisell/i18n';

const LABELS: Record<Locale, string> = { en: 'English', ar: 'العربية' };

export function LocaleSwitcher({ current }: { current: Locale }) {
  return (
    <nav aria-label="Language" className="flex items-center gap-1">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          className={[
            'rounded-md px-2 py-1 text-xs font-medium transition-colors',
            locale === current
              ? 'bg-brand-soft text-brand-600'
              : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
          ].join(' ')}
          onClick={() => {
            document.cookie = `omnisell-locale=${locale}; path=/; max-age=31536000; samesite=lax`;
            window.location.reload();
          }}
        >
          {LABELS[locale]}
        </button>
      ))}
    </nav>
  );
}