'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Badge, Button } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface BreachedException {
  id: string;
  tenantId: string;
  tenantName: string;
  orderId: string;
  type: string;
  status: string;
  slaDueAt: string | null;
  createdAt: string;
}

/**
 * Admin "Order Exceptions / SLA Breaches" board (featureslist.md 6.11) —
 * platform-wide across every tenant, mirroring the existing Jobs & Queues
 * board's own real-data, no-fabricated-rows standard
 * (`AdminOrderExceptionsController`, `admin/order-exceptions/breached`).
 */
export default function OrderExceptionsPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [rows, setRows] = useState<BreachedException[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await client.get<BreachedException[]>('/admin/order-exceptions/breached'));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('admin.orderExceptions.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('admin.orderExceptions.subtitle')}</p>
      </header>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {rows === null ? (
          <p className="p-4 text-sm text-text-secondary">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('admin.orderExceptions.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('admin.orderExceptions.table.tenant')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('admin.orderExceptions.table.order')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('admin.orderExceptions.table.type')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('admin.orderExceptions.table.slaDueAt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">{row.tenantName}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.orderId}</td>
                  <td className="px-4 py-2">{row.type}</td>
                  <td className="px-4 py-2">
                    <Badge tone="danger">{row.slaDueAt !== null ? new Date(row.slaDueAt).toLocaleString(locale) : '—'}</Badge>
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
