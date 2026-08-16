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

interface VideoContentView {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  pointsPerView: number | null;
  isActive: boolean;
}

/**
 * Video moderation (docs/points-extension.md §10.3, task 4.5.8). Creation
 * here uses the external-URL path (`VideoContentService`'s `url` branch) —
 * the server downloads and probes the real duration (§9.4), never trusting
 * a client-supplied value. The `uploadSessionId` path (resumable-upload
 * bytes already on this API) is real too but has no dedicated upload widget
 * in this pass — reuses the same Asset Library upload flow's session id if
 * one is supplied directly.
 */
export default function PointsVideosPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [videos, setVideos] = useState<VideoContentView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [pointsPerView, setPointsPerView] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setVideos(await client.get<VideoContentView[]>('/videos/all'));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    setCreateError(null);
    setBusy(true);
    try {
      await client.post('/videos', {
        title,
        url,
        ...(pointsPerView !== '' ? { pointsPerView: Number(pointsPerView) } : {}),
        isActive: true,
      });
      setTitle('');
      setUrl('');
      setPointsPerView('');
      await load();
    } catch (error) {
      setCreateError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }, [client, title, url, pointsPerView, load, t]);

  const archive = useCallback(
    async (id: string) => {
      await client.delete(`/videos/${id}`);
      await load();
    },
    [client, load],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{t('admin.points.videos.title')}</h1>

      <div className="space-y-2 rounded-lg bg-surface-1 p-4">
        <input className="w-full rounded border border-border-subtle p-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input
          className="w-full rounded border border-border-subtle p-2"
          placeholder="https://…mp4 (server fetches + probes real duration)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          type="number"
          className="w-full rounded border border-border-subtle p-2"
          placeholder="Points override (optional)"
          value={pointsPerView}
          onChange={(e) => setPointsPerView(e.target.value)}
        />
        <Button disabled={busy || title === '' || url === ''} onClick={() => void create()}>
          {busy ? '…' : t('admin.points.videos.create')}
        </Button>
        {createError !== null && <p className="text-sm text-danger">{createError}</p>}
      </div>

      {loadError !== null && <p className="text-danger">{loadError}</p>}
      {videos === null && loadError === null && <Skeleton className="h-40 w-full" />}
      {videos !== null && (
        <ul className="divide-y divide-border-subtle">
          {videos.map((video) => (
            <li key={video.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-text-primary">{video.title}</p>
                <p className="text-xs text-text-secondary">{t('admin.points.videos.durationProbed', { seconds: video.durationSeconds })}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={video.isActive ? 'success' : 'neutral'}>{video.isActive ? 'ACTIVE' : 'ARCHIVED'}</Badge>
                {video.isActive && (
                  <Button size="sm" variant="secondary" onClick={() => void archive(video.id)}>
                    {t('admin.points.videos.archive')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
