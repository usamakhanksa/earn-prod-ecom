'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { OrderDetail } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

function formatMoney(minor: string, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

export interface OrderDetailViewProps {
  orderId: string;
}

/** Order detail: items, fulfilments/shipments, exceptions, activity, and the
 * full status-machine/fulfilment/returns-refunds action set (featureslist.md
 * §6, tasks 5.2/5.4/5.7/5.9). */
export function OrderDetailView({ orderId }: OrderDetailViewProps): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<OrderDetail>(`/orders/${orderId}`);
      setOrder(result);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, orderId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(name: string, fn: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    setBusy(name);
    try {
      await fn();
      await load();
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  if (loadError !== null) {
    return (
      <div role="alert" className="mx-auto max-w-4xl rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        <p>{loadError}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const idem = (): string => crypto.randomUUID();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/orders" className="text-sm text-brand-600 hover:underline">
        ← {t('orders.detail.backToFeed')}
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-text-secondary">{order.buyerName ?? order.buyerEmail ?? '—'}</p>
        </div>
        <Badge tone="neutral">{t(`orders.status.${order.status}`)}</Badge>
      </header>

      {actionError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {actionError}
        </div>
      ) : null}

      <section className="flex flex-wrap gap-2" aria-label={t('orders.detail.actions')}>
        <Button variant="primary" size="sm" loading={busy === 'fulfil'} onClick={() => void runAction('fulfil', () => client.post(`/orders/${orderId}/fulfil`, {}, idem()))}>
          {t('orders.detail.fulfil')}
        </Button>
        {order.status === 'ON_HOLD' ? (
          <Button variant="secondary" size="sm" loading={busy === 'release'} onClick={() => void runAction('release', () => client.post(`/orders/${orderId}/release`, {}, idem()))}>
            {t('orders.detail.release')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'hold'}
            onClick={() => {
              const reason = window.prompt(t('orders.detail.holdReasonPrompt'));
              if (reason !== null && reason.length > 0) void runAction('hold', () => client.post(`/orders/${orderId}/hold`, { reason }, idem()));
            }}
          >
            {t('orders.detail.hold')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          loading={busy === 'cancel'}
          onClick={() => {
            const reason = window.prompt(t('orders.detail.cancelReasonPrompt'));
            if (reason !== null && reason.length > 0) void runAction('cancel', () => client.post(`/orders/${orderId}/cancel`, { reason }, idem()));
          }}
        >
          {t('orders.detail.cancel')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={busy === 'refund'}
          onClick={() => {
            const amount = window.prompt(t('orders.detail.refundAmountPrompt'));
            const reason = amount !== null ? window.prompt(t('orders.detail.refundReasonPrompt')) : null;
            if (amount !== null && reason !== null && reason.length > 0) {
              const amountMinor = Math.round(Number.parseFloat(amount) * 100).toString();
              void runAction('refund', () => client.post(`/orders/${orderId}/refund`, { amountMinor, reason }, idem()));
            }
          }}
        >
          {t('orders.detail.refund')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={busy === 'reprint'}
          onClick={() => {
            const reason = window.prompt(t('orders.detail.reprint'));
            if (reason !== null && reason.length > 0) void runAction('reprint', () => client.post(`/orders/${orderId}/reprint`, { reason, costMinor: '0' }, idem()));
          }}
        >
          {t('orders.detail.reprint')}
        </Button>
        <a href={`/v1/orders/${orderId}/packing-slip?locale=${locale}`} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm">{t('orders.detail.packingSlip')}</Button>
        </a>
        <a href={`/v1/orders/${orderId}/invoice?locale=${locale}`} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm">{t('orders.detail.invoice')}</Button>
        </a>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-secondary">{t('orders.detail.items')}</h2>
        <table className="w-full text-start text-sm">
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-border-subtle">
                <td className="px-2 py-2">{item.title}</td>
                <td className="px-2 py-2 text-text-secondary">×{item.quantity}</td>
                <td className="px-2 py-2 text-end tabular-nums">{formatMoney(item.totalPriceMinor, item.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-end text-sm font-semibold tabular-nums">{formatMoney(order.totalMinor, order.currency)}</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-secondary">{t('orders.detail.exceptions')}</h2>
        {order.exceptions.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('orders.detail.noExceptions')}</p>
        ) : (
          <ul className="space-y-2">
            {order.exceptions.map((exception) => (
              <li key={exception.id} className="rounded-md border border-border-subtle p-3 text-sm">
                <Badge tone={exception.status === 'RESOLVED' ? 'success' : 'danger'}>{t(`orders.exceptions.type.${exception.type}`)}</Badge>
                <span className="ms-2 text-text-secondary">{exception.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-secondary">{t('orders.detail.events')}</h2>
        <ol className="space-y-1 text-sm text-text-secondary">
          {order.events.map((event) => (
            <li key={event.id}>
              <span className="tabular-nums">{new Date(event.createdAt).toLocaleString(locale)}</span> — {event.message}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
