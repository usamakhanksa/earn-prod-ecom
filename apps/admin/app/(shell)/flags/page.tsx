'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface FlagDefinition {
  id: string;
  key: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPct: number | null;
}

/** Feature Flags & Config (prompt.md Phase 1.11 / featureslist.md §0.2). Real
 * CRUD against `FeatureFlagService` — per-tenant targeting/% rollout have
 * their own tenant-scoped endpoints (apps/api/src/feature-flags) but no admin
 * UI for setting a *specific* tenant's override yet; this screen manages the
 * global default only. See docs/DEBT.md. */
export default function FeatureFlagsPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [flags, setFlags] = useState<FlagDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setFlags(await client.get<FlagDefinition[]>('/feature-flags/definitions'));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(flag: FlagDefinition): Promise<void> {
    await client.put(`/feature-flags/${flag.key}`, { isEnabled: !flag.isEnabled });
    await load();
  }

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (newKey.trim().length === 0) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await client.post('/feature-flags', { key: newKey.trim(), isEnabled: false }, crypto.randomUUID());
      setNewKey('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('common.error'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-text-primary">{t('admin.nav.featureFlags')}</h1>
        <p className="mt-1 text-xs text-text-secondary">{t('admin.flags.subtitle')}</p>
      </header>

      <form onSubmit={handleCreate} className="flex items-end gap-3 rounded-lg border border-border-subtle bg-surface-1 p-4">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('admin.flags.newKey')}</span>
          <input
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            placeholder="my_new_flag"
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <Button type="submit" variant="danger" loading={creating}>
          {t('admin.flags.create')}
        </Button>
      </form>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {flags === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : flags.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('common.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-start">{t('admin.flags.key')}</th>
                <th className="px-4 py-2 text-start">{t('admin.flags.status')}</th>
                <th className="px-4 py-2 text-start">{t('team.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2 font-mono text-text-primary">{flag.key}</td>
                  <td className="px-4 py-2">
                    <Badge tone={flag.isEnabled ? 'success' : 'neutral'}>
                      {flag.isEnabled ? t('admin.flags.on') : t('admin.flags.off')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => void toggle(flag)}>
                      {flag.isEnabled ? t('admin.flags.disable') : t('admin.flags.enable')}
                    </Button>
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
