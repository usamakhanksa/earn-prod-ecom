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

interface ProductSummary {
  id: string;
  name: string;
  priceMinor: string;
  currency: string;
}

interface PreviewResult {
  discountCurrencyMinor: string;
  subtotalMinor: string;
  afterDiscountMinor: string;
  currency: string;
}

function money(minor: string, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

/**
 * Consumer shop browse + redemption (docs/points-extension.md §10.3, C-4/
 * C-11, task 4.5.7). The points "slider" is a native range input constrained
 * by 100-point steps; the PREVIEW endpoint is the source of truth for the
 * floor/share-cap/balance checks (§7.4) — a consumer role cannot read
 * `TenantPointSettings` directly.
 */
export default function ConsumerShopPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [points, setPoints] = useState(100);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [productsPage, wallet] = await Promise.all([
        client.get<{ items: ProductSummary[] }>('/products'),
        client.get<{ balance: string }>('/wallet'),
      ]);
      setProducts(productsPage.items);
      setBalance(wallet.balance);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openRedeem = (productId: string) => {
    setExpandedId(productId);
    setPoints(100);
    setPreview(null);
    setRedeemError(null);
    setConfirmedId(null);
  };

  const runPreview = useCallback(
    async (productId: string, pointsToUse: number) => {
      setRedeemError(null);
      try {
        setPreview(await client.post<PreviewResult>('/wallet/redeem', { productId, pointsToUse }));
      } catch (error) {
        setPreview(null);
        setRedeemError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
      }
    },
    [client, t],
  );

  const runConfirm = useCallback(
    async (productId: string, pointsToUse: number) => {
      try {
        const result = await client.post<{ purchaseId: string; balanceAfter: string }>(
          '/wallet/redeem/confirm',
          { orderId: null, productId, pointsToUse },
          crypto.randomUUID(),
        );
        setConfirmedId(result.purchaseId);
        setBalance(result.balanceAfter);
      } catch (error) {
        setRedeemError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
      }
    },
    [client, t],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t('shop.title')}</h1>
        <p className="text-sm text-text-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {t('wallet.balanceLabel')}: {balance}
        </p>
      </div>

      {loadError !== null && <p className="text-danger">{t('shop.error.title')}</p>}
      {products === null && loadError === null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {products !== null && products.length === 0 && <p className="text-text-secondary">{t('shop.empty.title')}</p>}

      <div className="space-y-4">
        {products?.map((product) => (
          <div key={product.id} className="rounded-2xl bg-surface-1 p-4" style={{ borderRadius: 'var(--radius-consumer)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-text-primary">{product.name}</p>
                <p className="text-sm text-text-secondary">{money(product.priceMinor, product.currency)}</p>
                <Badge tone="warning">{t('shop.pointsDiscountBadge', { amount: money(String(Number(product.priceMinor) / 2), product.currency) })}</Badge>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openRedeem(product.id)}>
                {t('shop.redeem.confirm')}
              </Button>
            </div>

            {expandedId === product.id && (
              <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
                <label className="block text-sm font-medium text-text-primary" htmlFor={`points-${product.id}`}>
                  {t('shop.redeem.sliderLabel')}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{points}</span>
                </label>
                <input
                  id={`points-${product.id}`}
                  type="range"
                  min={100}
                  max={Math.max(100, Number(balance))}
                  step={100}
                  value={Math.min(points, Math.max(100, Number(balance)))}
                  onChange={(event) => setPoints(Number(event.target.value))}
                  className="w-full"
                />

                <Button size="sm" onClick={() => void runPreview(product.id, points)}>
                  {t('shop.redeem.previewDiscount', { amount: '' })}
                </Button>

                {redeemError !== null && <p className="text-sm text-danger">{redeemError}</p>}

                {preview !== null && confirmedId === null && (
                  <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm">
                    <p>{t('shop.redeem.previewDiscount', { amount: money(preview.discountCurrencyMinor, preview.currency) })}</p>
                    <p>{t('shop.redeem.subtotal', { amount: money(preview.subtotalMinor, preview.currency) })}</p>
                    <p className="font-semibold">{t('shop.redeem.afterDiscount', { amount: money(preview.afterDiscountMinor, preview.currency) })}</p>
                    <Button size="sm" className="mt-2" onClick={() => void runConfirm(product.id, points)}>
                      {t('shop.redeem.confirm')}
                    </Button>
                  </div>
                )}

                {confirmedId !== null && <p className="font-semibold text-success">✓ {t('shop.redeem.confirm')}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
