'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { FinancePayoutView } from '@omnisell/shared';
import { Badge, Skeleton, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

const VARIANCE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  MATCHED: 'success',
  MINOR_VARIANCE: 'warning',
  MAJOR_VARIANCE: 'danger',
  DISPUTED: 'danger',
  PENDING: 'neutral',
};

/** Earnings Overview (Phase 6, task 6.4's web surface) — real `FinancePayout`
 * batches: expected (from OmniSell's own Order/OrderFee data) vs. actual
 * (once reconciled), with a variance badge. */
export function EarningsOverviewView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [payouts, setPayouts] = useState<FinancePayoutView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<{ items: FinancePayoutView[] }>('/earnings');
      setPayouts(result.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('finance.earnings.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('finance.earnings.subtitle')}</p>
      </header>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {payouts === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : payouts.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('finance.earnings.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.earnings.table.channel')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.earnings.table.period')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.earnings.table.expected')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.earnings.table.actual')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.earnings.table.variance')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.earnings.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">{payout.connectorSlug}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {new Date(payout.periodStart).toLocaleDateString(locale)} – {new Date(payout.periodEnd).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{payout.expectedMinor !== null ? formatMoneyMinor(payout.expectedMinor, payout.currency, locale) : '—'}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{formatMoneyMinor(payout.amountMinor, payout.currency, locale)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{payout.varianceMinor !== null ? formatMoneyMinor(payout.varianceMinor, payout.currency, locale) : '—'}</td>
                  <td className="px-4 py-2">
                    <Badge tone={VARIANCE_TONE[payout.varianceStatus] ?? 'neutral'}>{payout.varianceStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
