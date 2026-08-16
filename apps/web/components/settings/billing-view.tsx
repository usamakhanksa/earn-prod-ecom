'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Badge, Skeleton, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

interface Plan {
  id: string;
  slug: string;
  name: string;
  priceMinor: string;
  currency: string;
  interval: string;
  aiCreditsIncluded: number;
}

interface Subscription {
  id: string;
  planId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
}

/** Settings > Billing (Phase 6, task 6.10) — real Stripe Billing integration
 * gated behind `STRIPE_SECRET_KEY` (absent in this sandbox): every action
 * here still creates/updates a real local `Subscription` row; the response
 * honestly reports `stripeSynced: false` when Stripe itself was skipped. */
export function BillingView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null | undefined>(undefined);
  const [aiCredits, setAiCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setError(null);
    try {
      const [plansResult, subResult, credits] = await Promise.all([
        client.get<Plan[]>('/plans'),
        client.get<Subscription | null>('/subscription'),
        client.get<{ balance: number }>('/ai/credits'),
      ]);
      setPlans(plansResult);
      setSubscription(subResult);
      setAiCredits(credits.balance);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function subscribe(planSlug: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const result = await client.post<{ stripeSynced: boolean }>('/subscription', { planSlug }, crypto.randomUUID());
      setNotice(result.stripeSynced ? null : t('settings.billing.stripeNotConfigured'));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    setBusy(true);
    try {
      await client.post('/subscription/cancel', {}, crypto.randomUUID());
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('settings.billing.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.billing.subtitle')}</p>
      </header>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      {notice !== null ? <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">{notice}</p> : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.billing.currentPlanHeading')}</h2>
        {subscription === undefined ? (
          <Skeleton className="h-5 w-full" />
        ) : subscription === null ? (
          <p className="text-sm text-text-secondary">{t('settings.billing.noSubscription')}</p>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border-subtle p-4">
            <Badge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>{subscription.status}</Badge>
            {subscription.cancelAtPeriodEnd ? <span className="text-xs text-text-secondary">Cancels at period end</span> : null}
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void cancel()}>
              {t('settings.billing.cancelButton')}
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.billing.plansHeading')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans === null ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="flex flex-col gap-2 rounded-lg border border-border-subtle p-4">
                <span className="font-semibold text-text-primary">{plan.name}</span>
                <span className="tabular-nums text-text-secondary">{formatMoneyMinor(plan.priceMinor, plan.currency, locale)} / {plan.interval.toLowerCase()}</span>
                <span className="text-xs text-text-secondary">{plan.aiCreditsIncluded} AI credits included</span>
                <Button variant="primary" size="sm" loading={busy} onClick={() => void subscribe(plan.slug)}>
                  {t('settings.billing.subscribeButton')}
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.billing.aiCreditsHeading')}</h2>
        {aiCredits === null ? <Skeleton className="h-5 w-24" /> : <p className="text-2xl font-bold tabular-nums text-text-primary">{aiCredits}</p>}
      </section>
    </div>
  );
}
