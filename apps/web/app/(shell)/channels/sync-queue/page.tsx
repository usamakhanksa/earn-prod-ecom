'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { SyncJobView } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * Channels -> Sync Queue (implentationplanphase.md tasks 4.6/4.7,
 * featureslist.md 5.6/5.7) — replaces the "coming soon" catch-all Phase 3
 * left here on purpose (Publishing was Phase 4 scope). Real `GET /sync-jobs`
 * list; each row links to the live pipeline view (signature moment #2).
 */
export default function SyncQueuePage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [jobs, setJobs] = useState<SyncJobView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      setJobs(await client.get<SyncJobView[]>('/sync-jobs'));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('channels.syncQueue.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('channels.syncQueue.subtitle')}</p>
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
        {jobs === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('channels.syncQueue.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.syncQueue.table.kind')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.syncQueue.table.status')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.syncQueue.table.progress')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.syncQueue.table.created')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">
                    <Link href={`/channels/sync-queue/${job.id}`} className="font-medium text-brand-600 hover:underline">
                      {job.kind}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : job.status === 'PARTIAL' ? 'warning' : 'neutral'}>
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {job.completedItems}/{job.totalItems} ({job.failedItems} {t('channels.syncQueue.table.failedSuffix')})
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{new Date(job.createdAt).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
