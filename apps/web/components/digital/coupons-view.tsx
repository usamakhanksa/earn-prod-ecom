'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { CouponView } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/** Coupon engine: %/fixed/BOGO, usage caps, expiry, per-channel
 * (featureslist.md 7.6, task 5.11). */
export function CouponsView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [coupons, setCoupons] = useState<CouponView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<CouponView[]>('/coupons');
      setCoupons(result);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCoupon(): Promise<void> {
    const code = window.prompt(t('digital.coupons.codePrompt'));
    if (code === null || code.length < 3) return;
    const percentInput = window.prompt(`${t('digital.coupons.typePercent')} % (1-100)`);
    if (percentInput === null) return;
    setCreating(true);
    try {
      await client.post('/coupons', { code, type: 'PERCENT', valuePercent: Number.parseInt(percentInput, 10) }, crypto.randomUUID());
      await load();
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('digital.coupons.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('digital.coupons.subtitle')}</p>
        </div>
        <Button variant="primary" loading={creating} onClick={() => void createCoupon()}>
          {t('digital.coupons.newButton')}
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
        {coupons === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : coupons.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('digital.coupons.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('digital.coupons.table.code')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('digital.coupons.table.type')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('digital.coupons.table.usage')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('digital.coupons.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2 font-mono">{coupon.code}</td>
                  <td className="px-4 py-2">
                    {coupon.type === 'PERCENT' ? `${coupon.valuePercent}%` : coupon.type === 'FIXED' ? `${coupon.valueMinor} ${coupon.currency}` : t('digital.coupons.typeBogo')}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {coupon.usageCount}
                    {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ''}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={coupon.isActive ? 'success' : 'neutral'}>{coupon.isActive ? 'Active' : 'Inactive'}</Badge>
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
