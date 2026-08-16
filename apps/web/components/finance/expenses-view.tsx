'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ExpenseView } from '@omnisell/shared';
import { Badge, Skeleton, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

/** Expenses (Phase 6, task 6.5) — receipt upload reuses Phase 2's presigned
 * S3 pipeline; OCR honestly shows "unavailable" rather than fake text. */
export function ExpensesView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [expenses, setExpenses] = useState<ExpenseView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<{ items: ExpenseView[] }>('/expenses');
      setExpenses(result.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createExpense(): Promise<void> {
    const category = window.prompt(t('finance.expenses.categoryPrompt'));
    if (category === null || category.trim().length === 0) return;
    const amountInput = window.prompt(t('finance.expenses.amountPrompt'));
    if (amountInput === null || !/^\d+$/.test(amountInput.trim())) return;
    const vendor = window.prompt(t('finance.expenses.vendorPrompt')) ?? undefined;
    setBusy(true);
    try {
      await client.post(
        '/expenses',
        { category: category.trim().toUpperCase(), amountMinor: amountInput.trim(), currency: 'USD', incurredAt: new Date().toISOString(), ...(vendor !== undefined && vendor.length > 0 ? { vendor } : {}) },
        crypto.randomUUID(),
      );
      await load();
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function decide(expense: ExpenseView, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    setBusy(true);
    try {
      await client.post(`/expenses/${expense.id}/decide`, { decision }, crypto.randomUUID());
      await load();
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('finance.expenses.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('finance.expenses.subtitle')}</p>
        </div>
        <Button variant="primary" loading={busy} onClick={() => void createExpense()}>
          {t('finance.expenses.newButton')}
        </Button>
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
        {expenses === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : expenses.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('finance.expenses.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.expenses.table.category')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.expenses.table.vendor')}</th>
                <th scope="col" className="px-4 py-2 text-end">{t('finance.expenses.table.amount')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.expenses.table.status')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('finance.expenses.table.ocr')}</th>
                <th scope="col" className="px-4 py-2 text-start"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">{expense.category}</td>
                  <td className="px-4 py-2">{expense.vendor ?? '—'}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{formatMoneyMinor(expense.amountMinor, expense.currency, locale)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[expense.status] ?? 'neutral'}>{expense.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-secondary">{expense.ocrStatus === 'UNAVAILABLE' ? t('finance.expenses.ocrUnavailable') : expense.ocrStatus}</td>
                  <td className="px-4 py-2">
                    {expense.status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(expense, 'APPROVED')}>
                          {t('finance.expenses.approve')}
                        </Button>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(expense, 'REJECTED')}>
                          {t('finance.expenses.reject')}
                        </Button>
                      </div>
                    ) : null}
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
