'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { BannedTermCategory, BannedTermMatchType, BannedTermView } from '@omnisell/shared';
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

const CATEGORIES: BannedTermCategory[] = ['TRADEMARK', 'IP', 'PROFANITY', 'OTHER'];
const MATCH_TYPES: BannedTermMatchType[] = ['EXACT', 'FUZZY'];

/**
 * Moderation → banned-term dictionary editor (README.md §5, featureslist.md
 * 5.15, implentationplanphase.md task 4.11) — admin-editable, global. Every
 * row here is the EXACT dictionary the publish orchestrator's hard gate
 * lints against; there is no second, UI-only copy.
 */
export default function ModerationPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [terms, setTerms] = useState<BannedTermView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<BannedTermCategory>('TRADEMARK');
  const [matchType, setMatchType] = useState<BannedTermMatchType>('FUZZY');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTerms(await client.get<BannedTermView[]>('/admin/banned-terms'));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (term.trim().length < 2) return;
    setSubmitting(true);
    try {
      await client.post('/admin/banned-terms', { term: term.trim(), category, matchType }, crypto.randomUUID());
      setTerm('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(row: BannedTermView): Promise<void> {
    await client.patch(`/admin/banned-terms/${row.id}`, { isActive: !row.isActive });
    await load();
  }

  async function handleDelete(row: BannedTermView): Promise<void> {
    if (!window.confirm(t('admin.moderation.deleteConfirm'))) return;
    await client.delete(`/admin/banned-terms/${row.id}`);
    await load();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-text-primary">{t('admin.nav.moderation')}</h1>
        <p className="mt-1 text-xs text-text-secondary">{t('admin.moderation.subtitle')}</p>
      </header>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <form onSubmit={(event) => void handleCreate(event)} className="flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-surface-1 p-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('admin.moderation.termField')}</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            required
            minLength={2}
            className="rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('admin.moderation.categoryField')}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as BannedTermCategory)} className="rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('admin.moderation.matchTypeField')}</span>
          <select value={matchType} onChange={(event) => setMatchType(event.target.value as BannedTermMatchType)} className="rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary">
            {MATCH_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" loading={submitting}>
          {t('admin.moderation.addButton')}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-2 text-start">{t('admin.moderation.table.term')}</th>
              <th className="px-4 py-2 text-start">{t('admin.moderation.table.category')}</th>
              <th className="px-4 py-2 text-start">{t('admin.moderation.table.matchType')}</th>
              <th className="px-4 py-2 text-start">{t('admin.moderation.table.status')}</th>
              <th className="px-4 py-2 text-start">{t('admin.moderation.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {terms?.map((row) => (
              <tr key={row.id} className="border-t border-border-subtle">
                <td className="px-4 py-2 font-medium text-text-primary">{row.term}</td>
                <td className="px-4 py-2 text-text-secondary">{row.category}</td>
                <td className="px-4 py-2 text-text-secondary">{row.matchType}</td>
                <td className="px-4 py-2">
                  <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? t('admin.moderation.active') : t('admin.moderation.inactive')}</Badge>
                </td>
                <td className="px-4 py-2 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void handleToggle(row)}>
                    {row.isActive ? t('admin.moderation.deactivate') : t('admin.moderation.activate')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(row)}>
                    {t('admin.moderation.delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
