'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

/**
 * Honest placeholder for every sidebar destination that doesn't have a real
 * page yet (prompt.md: a UI that renders mock/hardcoded data is rejected in
 * review — an explicit "coming soon" state is the alternative, not a 404 and
 * not fabricated content). Most of featureslist.md's sidebar tree (Catalog,
 * Channels, Listings, Orders, Digital Products, Gigs, Finance, Analytics,
 * Automations, most of Settings) is Phase 2+ scope — see docs/DEBT.md.
 */
export default function ComingSoonPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const params = useParams<{ slug: string[] }>();
  const path = `/${(params.slug ?? []).join('/')}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 py-16">
      <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary">{path}</span>
      <h1 className="text-xl font-semibold text-text-primary">{t('comingSoon.title')}</h1>
      <p className="text-sm text-text-secondary">{t('comingSoon.body')}</p>
    </div>
  );
}
