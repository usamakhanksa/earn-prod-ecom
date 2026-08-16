'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface EarningRuleView {
  id: string;
  action: string;
  points: number;
  minWatchSeconds: number | null;
  maxDailyCap: number | null;
  cooldownSeconds: number | null;
  isActive: boolean;
}

interface TenantPointSettingsView {
  currencyCode: string;
  pointsPerCurrencyMinor: number;
  minRedeemPoints: number;
  maxRedeemSharePct: number;
  autoExpireDays: number | null;
  expiryReminderDays: number;
  redemptionEnabled: boolean;
}

/** Point Rules + Settings admin (docs/points-extension.md §10.3, task 4.5.8).
 * RBAC-gated server-side (FINANCE/ADMIN/OWNER); this page assumes the caller
 * has access and lets the API's 403 surface as a real error otherwise. */
export default function PointsRulesPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [rules, setRules] = useState<EarningRuleView[] | null>(null);
  const [settings, setSettings] = useState<TenantPointSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<EarningRuleView>>({ action: 'video_watch', points: 50, isActive: true });
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [ruleList, settingsView] = await Promise.all([
        client.get<EarningRuleView[]>('/points/rules'),
        client.get<TenantPointSettingsView>('/points/settings'),
      ]);
      setRules(ruleList);
      setSettings(settingsView);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRule = useCallback(async () => {
    setSaveError(null);
    try {
      await client.put('/points/rules', draft);
      await load();
    } catch (error) {
      setSaveError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, draft, load, t]);

  const saveSettings = useCallback(
    async (patch: Partial<TenantPointSettingsView>) => {
      try {
        setSettings(await client.put<TenantPointSettingsView>('/points/settings', patch));
      } catch (error) {
        setSaveError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
      }
    },
    [client, t],
  );

  if (loadError !== null) {
    return (
      <div className="p-6">
        <p className="text-danger">{loadError}</p>
        <Button className="mt-2" onClick={() => void load()}>
          {t('wallet.transactions.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <section>
        <h1 className="mb-4 text-2xl font-bold text-text-primary">{t('admin.points.rules.title')}</h1>
        {rules === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="py-1">{t('admin.points.rules.action')}</th>
                <th>{t('admin.points.rules.points')}</th>
                <th>{t('admin.points.rules.minWatchSeconds')}</th>
                <th>{t('admin.points.rules.maxDailyCap')}</th>
                <th>{t('admin.points.rules.cooldownSeconds')}</th>
                <th>{t('admin.points.rules.isActive')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-border-subtle">
                  <td className="py-2">{rule.action}</td>
                  <td>{rule.points}</td>
                  <td>{rule.minWatchSeconds ?? '—'}</td>
                  <td>{rule.maxDailyCap ?? '—'}</td>
                  <td>{rule.cooldownSeconds ?? '—'}</td>
                  <td>{rule.isActive ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-surface-1 p-4 sm:grid-cols-3">
          <input
            className="rounded border border-border-subtle p-2"
            placeholder={t('admin.points.rules.action')}
            value={draft.action ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          />
          <input
            type="number"
            className="rounded border border-border-subtle p-2"
            placeholder={t('admin.points.rules.points')}
            value={draft.points ?? 0}
            onChange={(e) => setDraft((d) => ({ ...d, points: Number(e.target.value) }))}
          />
          <input
            type="number"
            className="rounded border border-border-subtle p-2"
            placeholder={t('admin.points.rules.minWatchSeconds')}
            onChange={(e) => setDraft((d) => ({ ...d, minWatchSeconds: Number(e.target.value) }))}
          />
          <input
            type="number"
            className="rounded border border-border-subtle p-2"
            placeholder={t('admin.points.rules.maxDailyCap')}
            onChange={(e) => setDraft((d) => ({ ...d, maxDailyCap: Number(e.target.value) }))}
          />
          <input
            type="number"
            className="rounded border border-border-subtle p-2"
            placeholder={t('admin.points.rules.cooldownSeconds')}
            onChange={(e) => setDraft((d) => ({ ...d, cooldownSeconds: Number(e.target.value) }))}
          />
          <Button onClick={() => void saveRule()}>{t('admin.points.rules.save')}</Button>
        </div>
        {saveError !== null && <p className="mt-2 text-sm text-danger">{saveError}</p>}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-text-primary">{t('admin.points.settings.title')}</h2>
        {settings === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-3 rounded-lg bg-surface-1 p-4">
            <label className="flex items-center justify-between text-sm">
              {t('admin.points.settings.pointsPerCurrencyMinor')}
              <input
                type="number"
                className="w-24 rounded border border-border-subtle p-1 text-right"
                defaultValue={settings.pointsPerCurrencyMinor}
                onBlur={(e) => void saveSettings({ pointsPerCurrencyMinor: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              {t('admin.points.settings.minRedeemPoints')}
              <input
                type="number"
                className="w-24 rounded border border-border-subtle p-1 text-right"
                defaultValue={settings.minRedeemPoints}
                onBlur={(e) => void saveSettings({ minRedeemPoints: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              {t('admin.points.settings.maxRedeemSharePct')}
              <input
                type="number"
                className="w-24 rounded border border-border-subtle p-1 text-right"
                defaultValue={settings.maxRedeemSharePct}
                onBlur={(e) => void saveSettings({ maxRedeemSharePct: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              {t('admin.points.settings.redemptionEnabled')}
              <input
                type="checkbox"
                defaultChecked={settings.redemptionEnabled}
                onChange={(e) => void saveSettings({ redemptionEnabled: e.target.checked })}
              />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
