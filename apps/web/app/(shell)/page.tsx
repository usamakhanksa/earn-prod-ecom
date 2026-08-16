'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { HealthWidget } from '@/components/health-widget';

/** Reads the same locale cookie the server layout used, so the dashboard's
 * client-rendered text matches — see apps/web/app/layout.tsx for the pattern
 * (no shared cookie-reading helper exists yet in this codebase). */
function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

export default function DashboardPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { user, currentTenant, isLoading } = useSession();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('nav.dashboard')}</h1>
          {isLoading ? (
            <Skeleton className="mt-2 h-4 w-64" />
          ) : (
            <p className="mt-1 text-sm text-text-secondary">
              {t('dashboard.greeting', { name: user?.name ?? user?.email ?? '' })}
              {currentTenant !== null ? ` · ${currentTenant.name} (${currentTenant.role})` : ''}
            </p>
          )}
        </div>
        <HealthWidget loadingLabel={t('common.loading')} />
      </header>

      <section aria-label={t('team.title')} className="rounded-lg border border-border-subtle bg-surface-consumer p-6 shadow-sh1">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{t('team.title')}</p>
        <p className="mt-2 text-sm text-text-secondary">{t('dashboard.teamCta')}</p>
        <Link
          href="/team"
          className="mt-4 inline-flex rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
        >
          {t('team.title')}
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(['nav.ordersGroup.title', 'nav.financeGroup.title', 'nav.analytics.title'] as const).map((key) => (
          <div key={key} className="rounded-lg border border-border-subtle p-4 shadow-sh1">
            <h2 className="text-sm font-semibold text-text-primary">{t(key)}</h2>
            <p className="mt-2 text-xs text-text-secondary">{t('dashboard.comingSoon')}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
