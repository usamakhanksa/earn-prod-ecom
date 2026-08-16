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

interface FraudQueueItemView {
  watchId: string;
  videoTitle: string;
  userId: string;
  signals: string[];
  watchSeconds: number;
  heartbeatCount: number;
  maxGapSeconds: number | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Fraud review queue (docs/points-extension.md §8.5/§10.3, task 4.5.8).
 * Approve → VALIDATED + credit; reject → REVERSED + mandatory note. Both are
 * audit-trailed server-side. */
export default function FraudQueuePage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [items, setItems] = useState<FraudQueueItemView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setItems(await client.get<FraudQueueItemView[]>('/points/fraud-queue'));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (watchId: string, decision: 'approve' | 'reject') => {
      const note = notes[watchId] ?? '';
      if (note.trim() === '') {
        setDecisionError(t('admin.points.fraudQueue.notePlaceholder'));
        return;
      }
      setDecisionError(null);
      setBusyId(watchId);
      try {
        await client.post(`/points/fraud-queue/${watchId}/${decision}`, { note });
        await load();
      } catch (error) {
        setDecisionError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
      } finally {
        setBusyId(null);
      }
    },
    [client, notes, load, t],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{t('admin.points.fraudQueue.title')}</h1>

      {loadError !== null && <p className="text-danger">{loadError}</p>}
      {items === null && loadError === null && <Skeleton className="h-40 w-full" />}
      {items !== null && items.length === 0 && <p className="text-text-secondary">{t('admin.points.fraudQueue.empty')}</p>}
      {decisionError !== null && <p className="text-sm text-danger">{decisionError}</p>}

      <ul className="space-y-4">
        {items?.map((item) => (
          <li key={item.watchId} className="rounded-lg bg-surface-1 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-text-primary">{item.videoTitle}</p>
              <p className="text-xs text-text-secondary">{new Date(item.createdAt).toLocaleString(locale)}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.signals.map((signal) => (
                <Badge key={signal} tone="danger">
                  {signal}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              watchSeconds={item.watchSeconds} · heartbeats={item.heartbeatCount} · maxGap={item.maxGapSeconds ?? '—'}s · ip={item.ipAddress ?? '—'} ·
              device={item.deviceFingerprint ?? '—'}
            </p>
            <textarea
              className="mt-2 w-full rounded border border-border-subtle p-2 text-sm"
              placeholder={t('admin.points.fraudQueue.notePlaceholder')}
              value={notes[item.watchId] ?? ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [item.watchId]: e.target.value }))}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busyId === item.watchId} onClick={() => void decide(item.watchId, 'approve')}>
                {t('admin.points.fraudQueue.approve')}
              </Button>
              <Button size="sm" variant="danger" disabled={busyId === item.watchId} onClick={() => void decide(item.watchId, 'reject')}>
                {t('admin.points.fraudQueue.reject')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
