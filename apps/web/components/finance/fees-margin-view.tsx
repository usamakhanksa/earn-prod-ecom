'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { FeeBreakdownView } from '@omnisell/shared';
import { Skeleton, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Fees & Margin Breakdown (Phase 6, task 6.2) — real per-account fee totals
 * from the ledger for the selected period (commission, payment processing,
 * print cost, shipping, tax remittance, other). */
export function FeesMarginView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [range, setRange] = useState(defaultRange());
  const [fees, setFees] = useState<FeeBreakdownView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<FeeBreakdownView[]>('/fees', { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() });
      setFees(result);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, range, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('finance.fees.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('finance.fees.subtitle')}</p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          {t('finance.fees.fromLabel')}
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="rounded-md border border-border-subtle px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          {t('finance.fees.toLabel')}
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="rounded-md border border-border-subtle px-2 py-1 text-sm" />
        </label>
        <Button type="submit" variant="secondary" size="sm">
          {t('finance.fees.loadButton')}
        </Button>
      </form>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {fees === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : fees.every((f) => f.amountMinor === '0') ? (
          <p className="p-4 text-sm text-text-secondary">{t('finance.fees.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.fees.table.type')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.fees.table.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.type} className="border-t border-border-subtle">
                  <td className="px-4 py-2">{fee.type}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{formatMoneyMinor(fee.amountMinor, fee.currency, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
