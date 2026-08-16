'use client';

import type { Locale } from '@omnisell/i18n';
import { LOCALES } from '@omnisell/i18n';

const LABELS: Record<Locale, string> = { en: 'English', ar: 'العربية' };

/** Mirrors apps/web/components/locale-switcher.tsx — the two apps don't share
 * a build target, so this is intentionally duplicated rather than imported. */
export function LocaleSwitcher({ current }: { current: Locale }): React.JSX.Element {
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
            locale === current ? 'bg-brand-soft text-brand-500' : 'text-text-secondary hover:bg-surface-2',
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
