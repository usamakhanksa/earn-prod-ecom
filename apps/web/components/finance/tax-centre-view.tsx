'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { TaxSummaryView } from '@omnisell/shared';
import { Badge, Skeleton, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

interface WithholdingNotes {
  disclaimer: string;
  notes: Array<{ jurisdictionType: string; note: string }>;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 89 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function Summary({ title, data, locale }: { title: string; data: TaxSummaryView | null; locale: 'en' | 'ar' }): React.JSX.Element {
  const { t } = createTranslator(locale);
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {data === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : data.byJurisdiction.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('finance.tax.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.tax.table.jurisdiction')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.tax.table.taxableSales')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.tax.table.taxCollected')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.tax.table.overThreshold')}</th>
              </tr>
            </thead>
            <tbody>
              {data.byJurisdiction.map((row) => (
                <tr key={`${row.jurisdictionType}-${row.jurisdictionCode}`} className="border-t border-border-subtle">
                  <td className="px-4 py-2">{row.jurisdictionCode}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{formatMoneyMinor(row.taxableSalesMinor, data.currency, locale)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{formatMoneyMinor(row.taxCollectedMinor, data.currency, locale)}</td>
                  <td className="px-4 py-2">{row.overThreshold ? <Badge tone="warning">Yes</Badge> : <Badge tone="neutral">No</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Tax Centre (Phase 6, task 6.7) — real VAT/OSS + US nexus summaries
 * computed from Order/TaxNexus data, plus general withholding guidance
 * (not tax advice). */
export function TaxCentreView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [range] = useState(defaultRange());
  const [vatSummary, setVatSummary] = useState<TaxSummaryView | null>(null);
  const [usSummary, setUsSummary] = useState<TaxSummaryView | null>(null);
  const [notes, setNotes] = useState<WithholdingNotes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const query = { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() };
      const [vat, us, withholding] = await Promise.all([
        client.get<TaxSummaryView>('/tax/vat-summary', query),
        client.get<TaxSummaryView>('/tax/us-summary', query),
        client.get<WithholdingNotes>('/tax/withholding-notes'),
      ]);
      setVatSummary(vat);
      setUsSummary(us);
      setNotes(withholding);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, range, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('finance.tax.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('finance.tax.subtitle')}</p>
      </header>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <Summary title={t('finance.tax.vatSummaryHeading')} data={vatSummary} locale={locale} />
      <Summary title={t('finance.tax.usSummaryHeading')} data={usSummary} locale={locale} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('finance.tax.withholdingHeading')}</h2>
        <p className="text-xs italic text-text-secondary">{notes?.disclaimer ?? t('finance.tax.disclaimer')}</p>
        <ul className="space-y-2">
          {(notes?.notes ?? []).map((note) => (
            <li key={note.jurisdictionType} className="rounded-lg border border-border-subtle p-3 text-sm">
              <span className="font-mono text-xs text-text-secondary">{note.jurisdictionType}</span>
              <p className="mt-1 text-text-primary">{note.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
