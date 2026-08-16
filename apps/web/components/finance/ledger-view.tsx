'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { LedgerEntryView } from '@omnisell/shared';
import { Badge, Skeleton, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

/** Ledger (Phase 6, task 6.1) — every real balanced double-entry posting:
 * order revenue, fee decomposition, refunds, payouts, expenses, FX gain/
 * loss, and manual corrections (flagged with an "Adjustment" badge). */
export function LedgerView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [entries, setEntries] = useState<LedgerEntryView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<{ items: LedgerEntryView[] }>('/ledger');
      setEntries(result.items);
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
        <h1 className="text-2xl font-bold text-text-primary">{t('finance.ledger.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('finance.ledger.subtitle')}</p>
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
        {entries === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('finance.ledger.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.ledger.table.date')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.ledger.table.memo')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.ledger.table.source')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.ledger.table.lines')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border-subtle align-top">
                  <td className="px-4 py-2 tabular-nums">{new Date(entry.occurredAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2">
                    {entry.memo}
                    {entry.isAdjustment ? (
                      <Badge tone="warning" className="ms-2">
                        {t('finance.ledger.adjustmentBadge')}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.sourceType}</td>
                  <td className="px-4 py-2">
                    <ul className="space-y-0.5">
                      {entry.lines.map((line) => (
                        <li key={line.id} className="flex justify-between gap-4 tabular-nums">
                          <span className="font-mono text-xs text-text-secondary">
                            {line.direction} {line.accountCode}
                          </span>
                          <span>{formatMoneyMinor(line.amountMinor, line.currencyCode, locale)}</span>
                        </li>
                      ))}
                    </ul>
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
