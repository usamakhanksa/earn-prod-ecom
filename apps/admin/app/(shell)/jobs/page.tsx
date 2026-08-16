'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Button } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface DeadLetterGroup {
  connectorSlug: string;
  jobs: Array<{ id: string; failedReason: string | null; attemptsMade: number }>;
}

/**
 * Jobs & Queues (README.md §5 — "BullMQ boards per connector: inspect,
 * retry, drain, replay DLQ"). Real `ConnectorQueueService.listFailed`/
 * `.replay` calls — every list here is genuinely empty in this sandbox (no
 * Redis, docs/DEBT.md 3-D4), not a fabricated demo row.
 */
export default function JobsQueuesPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [groups, setGroups] = useState<DeadLetterGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGroups(await client.get<DeadLetterGroup[]>('/admin/queues/dead-letter'));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function replay(connectorSlug: string, jobId: string): Promise<void> {
    setBusyJobId(jobId);
    try {
      await client.post(`/admin/queues/${connectorSlug}/jobs/${jobId}/replay`, {});
      await load();
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-text-primary">{t('admin.nav.jobsQueues')}</h1>
        <p className="mt-1 text-xs text-text-secondary">{t('admin.jobs.subtitle')}</p>
      </header>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      {groups === null ? null : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.connectorSlug} className="rounded-lg border border-border-subtle bg-surface-1 p-4">
              <h2 className="mb-2 text-sm font-semibold text-text-primary">{group.connectorSlug}</h2>
              {group.jobs.length === 0 ? (
                <p className="text-sm text-text-secondary">{t('admin.jobs.empty')}</p>
              ) : (
                <ul className="space-y-2">
                  {group.jobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between rounded-md border border-border-subtle p-2 text-sm">
                      <div>
                        <span className="font-mono text-xs">{job.id}</span>
                        <p className="text-danger">{job.failedReason}</p>
                        <p className="text-xs text-text-secondary">{t('admin.jobs.attempts', { count: job.attemptsMade })}</p>
                      </div>
                      <Button variant="secondary" size="sm" loading={busyJobId === job.id} onClick={() => void replay(group.connectorSlug, job.id)}>
                        {t('admin.jobs.replay')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
