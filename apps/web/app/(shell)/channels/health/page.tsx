'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ConnectionHealthView, ConnectionSummary } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * Connection Health board (prompt.md / featureslist.md 4.9 — last success,
 * error rate, latency, rate-limit headroom, token-expiry countdown). Built
 * against the real `GET /connections/:id/health` endpoint; the demo tenant's
 * rows are seeded (`docs/DEBT.md`) and CLEARLY labelled `isSeedData` in the
 * UI — no live traffic exists yet since Publishing is Phase 4.
 */
export default function ConnectionHealthBoardPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [rows, setRows] = useState<ConnectionHealthView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const connections = await client.get<ConnectionSummary[]>('/connections');
      const views = await Promise.all(connections.map((c) => client.get<ConnectionHealthView>(`/connections/${c.id}/health`)));
      setRows(views);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('nav.channels.connectionHealth')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('channels.health.subtitle')}</p>
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
        {rows === null ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('channels.health.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.label')}</th>
                <th className="px-4 py-2 text-start">{t('channels.health.lastSuccess')}</th>
                <th className="px-4 py-2 text-start">{t('channels.health.errorRate')}</th>
                <th className="px-4 py-2 text-start">{t('channels.health.avgLatency')}</th>
                <th className="px-4 py-2 text-start">{t('channels.health.rateLimitRemaining')}</th>
                <th className="px-4 py-2 text-start">{t('channels.health.tokenExpiry')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.connectionId} className="border-t border-border-subtle">
                  <td className="px-4 py-2">
                    <Link href={`/channels/connections/${row.connectionId}`} className="font-medium text-brand-600 hover:underline">
                      {row.label}
                    </Link>
                    {row.isSeedData ? (
                      <Badge tone="info" className="ms-2">
                        {t('channels.health.seedDataBadge')}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">
                    {row.lastSuccessAt !== null ? new Date(row.lastSuccessAt).toLocaleString(locale) : '—'}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    <span className={row.errorRatePct > 10 ? 'text-danger' : 'text-text-primary'}>{row.errorRatePct}%</span>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">{row.avgLatencyMs !== null ? `${row.avgLatencyMs}ms` : '—'}</td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">{row.rateLimitRemaining ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">
                    {row.tokenExpiresInSeconds !== null ? t('channels.health.expiresInSeconds', { seconds: row.tokenExpiresInSeconds }) : '—'}
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
