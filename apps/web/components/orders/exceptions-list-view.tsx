'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { OrderExceptionView } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/** Exception queue with resolution actions + SLA timers (featureslist.md
 * 6.7/6.11, task 5.6). */
export function ExceptionsListView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [rows, setRows] = useState<OrderExceptionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<{ items: OrderExceptionView[]; nextCursor: string | null }>('/orders/exceptions');
      setRows(result.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acknowledge(id: string): Promise<void> {
    setBusy(id);
    try {
      await client.post(`/orders/exceptions/${id}/acknowledge`, {}, crypto.randomUUID());
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function resolve(id: string): Promise<void> {
    const resolutionNote = window.prompt(t('orders.exceptions.resolutionPrompt'));
    if (resolutionNote === null || resolutionNote.length === 0) return;
    setBusy(id);
    try {
      await client.post(`/orders/exceptions/${id}/resolve`, { resolutionNote }, crypto.randomUUID());
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('orders.exceptions.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('orders.exceptions.subtitle')}</p>
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
            <Skeleton className="h-5 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('orders.exceptions.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.exceptions.table.order')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.exceptions.table.type')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.exceptions.table.slaDueAt')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.exceptions.table.status')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.exceptions.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const breached = row.slaDueAt !== null && new Date(row.slaDueAt).getTime() < Date.now() && row.status !== 'RESOLVED';
                return (
                  <tr key={row.id} className="border-t border-border-subtle">
                    <td className="px-4 py-2">
                      <Link href={`/orders/${row.orderId}`} className="font-medium text-brand-600 hover:underline">
                        {row.orderId}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{t(`orders.exceptions.type.${row.type}`)}</td>
                    <td className="px-4 py-2">
                      <span className={breached ? 'font-semibold text-danger' : 'text-text-secondary'}>
                        {row.slaDueAt !== null ? new Date(row.slaDueAt).toLocaleString(locale) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={row.status === 'RESOLVED' ? 'success' : breached ? 'danger' : 'warning'}>{t(`orders.exceptions.status.${row.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      {row.status === 'OPEN' ? (
                        <Button variant="secondary" size="sm" loading={busy === row.id} onClick={() => void acknowledge(row.id)}>
                          {t('orders.exceptions.acknowledge')}
                        </Button>
                      ) : null}
                      {row.status !== 'RESOLVED' ? (
                        <Button variant="primary" size="sm" loading={busy === row.id} onClick={() => void resolve(row.id)}>
                          {t('orders.exceptions.resolve')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
