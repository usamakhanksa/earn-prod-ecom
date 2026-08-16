'use client';

import { useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import type { SyncJobView } from '@omnisell/shared';
import { Badge, Button, Spinner } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * The publish pipeline view (prompt.md "signature moment #2") — per-channel
 * job cards streaming status via a REAL SSE connection
 * (`OmniSellClient.streamSse`, a fetch-based consumer — see its doc comment
 * for why not the native `EventSource`). Renders a channel-logo-rail-style
 * row of cards, one per `SyncJobItem`.
 *
 * Honest limitation (docs/DEBT.md): the stream genuinely subscribes and
 * genuinely updates on any real change — but nothing in this sandbox moves a
 * job through Redis after the initial fan-out (no live queue worker), so a
 * multi-second live progression cannot be demonstrated end-to-end here. The
 * initial snapshot and the SSE wiring are both real.
 */
export function PublishPipelineView({ syncJobId }: { syncJobId: string }): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [job, setJob] = useState<SyncJobView | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void client.get<SyncJobView>(`/sync-jobs/${syncJobId}/snapshot`).then((snapshot) => {
      if (active) setJob(snapshot);
    });

    const unsubscribe = client.streamSse<SyncJobView>(`/sync-jobs/${syncJobId}`, {
      onEvent: (update) => {
        if (active) {
          setJob(update);
          setConnected(true);
        }
      },
      onError: () => {
        if (active) setStreamError(t('channels.pipeline.streamError'));
      },
      onDone: () => {
        if (active) setConnected(false);
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, syncJobId, t]);

  async function replay(): Promise<void> {
    await client.post(`/sync-jobs/${syncJobId}/replay`, {});
    const snapshot = await client.get<SyncJobView>(`/sync-jobs/${syncJobId}/snapshot`);
    setJob(snapshot);
  }

  if (job === null) {
    return <Spinner aria-label={t('common.loading')} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">{t('channels.pipeline.title', { kind: job.kind })}</h2>
          <Badge tone={connected ? 'success' : 'neutral'}>{connected ? t('channels.pipeline.live') : t('channels.pipeline.idle')}</Badge>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void replay()}>
          {t('channels.pipeline.replayFailed')}
        </Button>
      </div>

      {streamError !== null ? <p role="alert" className="text-sm text-danger">{streamError}</p> : null}

      <p className="text-sm text-text-secondary">
        {t('channels.pipeline.progress', { completed: job.completedItems, failed: job.failedItems, total: job.totalItems })}
      </p>

      {/* Channel-logo rail — one job card per (listing x channel) item. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label={t('channels.pipeline.cardsLabel')}>
        {job.items.map((item) => (
          <div key={item.id} role="listitem" className="rounded-lg border border-border-subtle bg-surface-1 p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-xs text-text-secondary">{item.id.slice(0, 8)}</span>
              <Badge tone={cardTone(item.status)}>{t(`channels.pipeline.itemStatus.${item.status}`)}</Badge>
            </div>
            <p className="text-sm text-text-secondary">{t('channels.pipeline.attempts', { count: item.attempts })}</p>
            {item.lastError !== null ? <p className="mt-1 text-xs text-danger">{item.lastError}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function cardTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'RUNNING' || status === 'QUEUED') return 'warning';
  if (status === 'FAILED' || status === 'DLQ') return 'danger';
  return 'neutral';
}
