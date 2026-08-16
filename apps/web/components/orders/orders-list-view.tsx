'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { OrderSummary } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'DELIVERED' || status === 'CLOSED') return 'success';
  if (status === 'NEW' || status === 'CONFIRMED' || status === 'IN_PRODUCTION' || status === 'SHIPPED') return 'warning';
  if (status === 'CANCELLED' || status === 'REFUNDED' || status === 'ON_HOLD') return 'danger';
  return 'neutral';
}

function formatMoney(minor: string, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

/** Unified order feed (featureslist.md 6.1/6.14, task 5.3). */
export function OrdersListView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const query: Record<string, string> = {};
      if (search.length > 0) query.search = search;
      const result = await client.get<{ items: OrderSummary[]; nextCursor: string | null }>('/orders', query);
      setOrders(result.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, search, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('orders.feed.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('orders.feed.subtitle')}</p>
        </div>
        <a href="/v1/orders/export" target="_blank" rel="noreferrer">
          <Button variant="secondary">{t('orders.feed.exportCsv')}</Button>
        </a>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('orders.feed.searchPlaceholder')}
        aria-label={t('orders.feed.searchPlaceholder')}
        className="w-full max-w-md rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm"
      />

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {orders === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : orders.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('orders.feed.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.table.orderNumber')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.table.buyer')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.table.channel')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.table.status')}</th>
                <th scope="col" className="px-4 py-2 text-end font-variant-numeric-tabular">{t('orders.table.total')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.table.placedAt')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('orders.table.exceptions')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">
                    <Link href={`/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{order.buyerName ?? order.buyerEmail ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{order.connectorSlug}</td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(order.status)}>{t(`orders.status.${order.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{formatMoney(order.totalMinor, order.currency)}</td>
                  <td className="px-4 py-2 text-text-secondary">{new Date(order.placedAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2">
                    {order.openExceptionCount > 0 ? <Badge tone="danger">{order.openExceptionCount}</Badge> : null}
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
