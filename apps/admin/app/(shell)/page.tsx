'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HealthReport } from '@omnisell/shared';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { Badge, Skeleton } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface FlagDefinition {
  key: string;
  isEnabled: boolean;
}

/** Command Centre (featureslist.md §0.2 — "live KPIs, incidents, queue depth").
 * Only two data points are real in this pass: platform health (`/v1/readyz`)
 * and the feature-flag roster — everything else (MRR, tenant counts, queue
 * depth) needs modules that land in later phases (docs/DEBT.md), so this
 * deliberately shows an honest "not wired yet" note instead of a fake number. */
export default function AdminCommandCentre(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [health, setHealth] = useState<HealthReport | null>(null);
  const [flags, setFlags] = useState<FlagDefinition[] | null>(null);

  useEffect(() => {
    client.get<HealthReport>('/readyz').then(setHealth).catch(() => setHealth(null));
    client.get<FlagDefinition[]>('/feature-flags/definitions').then(setFlags).catch(() => setFlags([]));
  }, [client]);

  const enabledCount = flags?.filter((flag) => flag.isEnabled).length ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-xl font-bold text-text-primary">{t('admin.nav.commandCentre')}</h1>
        <p className="mt-1 text-xs text-text-secondary">{t('admin.commandCentre.subtitle')}</p>
      </header>

      <section aria-label={t('admin.commandCentre.health')} className="rounded-lg border border-border-subtle bg-surface-1 p-4 shadow-sh1">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{t('admin.commandCentre.health')}</p>
        {health === null ? (
          <Skeleton className="mt-2 h-6 w-40" />
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(health.checks).map(([name, status]) => (
              <Badge key={name} tone={status === 'ok' ? 'success' : status === 'degraded' ? 'warning' : 'danger'}>
                {name}: {status}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section aria-label={t('admin.nav.featureFlags')} className="rounded-lg border border-border-subtle bg-surface-1 p-4 shadow-sh1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{t('admin.nav.featureFlags')}</p>
          <Link href="/flags" className="text-xs font-medium text-brand-500 hover:underline">
            {t('admin.commandCentre.manage')}
          </Link>
        </div>
        {flags === null ? (
          <Skeleton className="mt-2 h-6 w-40" />
        ) : (
          <p className="mt-2 font-mono text-2xl tabular-nums text-text-primary">
            {enabledCount}/{flags.length}
          </p>
        )}
        <p className="mt-1 text-[11px] text-text-secondary">{t('admin.commandCentre.flagsEnabled')}</p>
      </section>

      <section
        aria-label={t('admin.commandCentre.deferredTitle')}
        className="rounded-lg border border-border-subtle bg-surface-1 p-4 text-xs text-text-secondary"
      >
        {t('admin.commandCentre.deferredBody')}
      </section>
    </div>
  );
}
