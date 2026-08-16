'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface WalletView {
  balance: string;
  todayEarned: string;
  todayCapped: boolean;
  lifetimeEarned: string;
  lifetimeSpent: string;
  nextExpiry: { at: string; amount: string } | null;
}

interface PointTransactionView {
  id: string;
  type: 'EARN' | 'SPEND' | 'ADJUST' | 'EXPIRY';
  amount: string;
  source: string;
  status: string;
  createdAt: string;
}

/**
 * Consumer wallet screen (docs/points-extension.md §10.3, task 4.5.7).
 * Derived balance (tabular-nums), today's-earned-vs-cap meter, transaction
 * list with real loading/empty/error states, and an expiry warning.
 */
export default function ConsumerWalletPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [transactions, setTransactions] = useState<PointTransactionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'EARN' | 'SPEND' | 'ADJUST' | 'EXPIRY'>('ALL');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [walletView, txPage] = await Promise.all([
        client.get<WalletView>('/wallet'),
        client.get<{ items: PointTransactionView[] }>('/wallet/transactions'),
      ]);
      setWallet(walletView);
      setTransactions(txPage.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = transactions?.filter((tx) => filter === 'ALL' || tx.type === filter) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{t('wallet.title')}</h1>

      {loadError !== null && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm text-danger">{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('wallet.transactions.retry')}
          </Button>
        </div>
      )}

      {wallet === null && loadError === null ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : wallet !== null ? (
        <div className="rounded-2xl bg-ink-800 p-6 text-center" style={{ borderRadius: 'var(--radius-consumer)' }}>
          <p className="text-sm text-ink-200">{t('wallet.balanceLabel')}</p>
          <p className="text-5xl font-extrabold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {wallet.balance}
          </p>
          <p className="text-sm text-ink-200">{t('wallet.balanceUnit')}</p>

          <div className="mt-4 text-left">
            <p className="text-sm text-ink-100">
              {t('wallet.todayEarnedOfCap', { earned: wallet.todayEarned, cap: '500' })}
            </p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-2 rounded-full bg-[var(--consumer-accent)]"
                style={{ width: `${Math.min(100, (Number(wallet.todayEarned) / 500) * 100)}%` }}
              />
            </div>
          </div>

          {wallet.nextExpiry !== null && (
            <p className="mt-3 text-sm text-warning">
              {t('wallet.expiry.warning', { amount: wallet.nextExpiry.amount, date: new Date(wallet.nextExpiry.at).toLocaleDateString(locale) })}
            </p>
          )}
        </div>
      ) : null}

      {wallet !== null && wallet.balance === '0' && (transactions?.length ?? 0) === 0 && (
        <div className="rounded-xl bg-brand-soft p-4">
          <p className="font-semibold text-brand-600">{t('wallet.onboarding.title')}</p>
          <p className="text-sm text-text-secondary">{t('wallet.onboarding.body')}</p>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{t('wallet.transactions.title')}</h2>
          <div className="flex gap-1" role="group" aria-label={t('wallet.transactions.title')}>
            {(['ALL', 'EARN', 'SPEND', 'ADJUST', 'EXPIRY'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={['rounded-full px-3 py-1 text-xs font-medium', filter === key ? 'bg-brand-600 text-white' : 'bg-surface-2 text-text-secondary'].join(' ')}
              >
                {t(key === 'ALL' ? 'wallet.transactions.filter.all' : `wallet.transactions.filter.${key.toLowerCase()}`)}
              </button>
            ))}
          </div>
        </div>

        {transactions === null && loadError === null ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('wallet.transactions.empty.body')}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{tx.source}</p>
                  <p className="text-xs text-text-secondary">{new Date(tx.createdAt).toLocaleDateString(locale)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={tx.status === 'VALIDATED' ? 'success' : tx.status === 'REVERSED' ? 'danger' : 'neutral'}>{tx.status}</Badge>
                  <span
                    className={['font-semibold', tx.amount.startsWith('-') ? 'text-danger' : 'text-success'].join(' ')}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {tx.amount}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
