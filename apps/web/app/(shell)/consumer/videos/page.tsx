'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  thumbnailUrl: string | null;
  resolvedPointsPerView: number;
  isActive: boolean;
}

const HEARTBEAT_MS = 5000;
type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'earned' | 'fraud-blocked';

/**
 * Video feed + player (docs/points-extension.md §10.2/§10.3, task 4.5.7).
 * Explicit play only (no `autoPlay`); heartbeat loop starts on play, stops
 * on pause/unmount; announces earned points via a real `aria-live` region;
 * keyboard-operable (native `<video controls>`); respects
 * `prefers-reduced-motion` (no animation used here at all).
 */
export default function ConsumerVideosPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [videos, setVideos] = useState<VideoContentView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<VideoContentView | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [state, setState] = useState<PlayerState>('idle');
  const [earnedPoints, setEarnedPoints] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setVideos(await client.get<VideoContentView[]>('/videos'));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current !== null) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  useEffect(() => stopHeartbeat, [stopHeartbeat]);

  const finish = useCallback(async () => {
    if (watchId === null || completedRef.current) return;
    completedRef.current = true;
    stopHeartbeat();
    const position = Math.round(videoRef.current?.currentTime ?? 0);
    try {
      const result = await client.post<{ earnedPoints: string | null }>(`/video-watches/${watchId}/complete`, {
        finalHeartbeat: { timestamp: new Date().toISOString(), watchPosition: position },
      });
      setEarnedPoints(result.earnedPoints);
      setState('earned');
      if (result.earnedPoints !== null) {
        setLiveMessage(t('player.ariaLiveEarned', { points: result.earnedPoints }));
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'WATCH_FRAUD_SUSPECT') {
        setState('fraud-blocked');
      } else {
        setState('error');
      }
    }
  }, [client, watchId, stopHeartbeat, t]);

  const openVideo = (video: VideoContentView) => {
    setActive(video);
    setWatchId(null);
    setEarnedPoints(null);
    setLiveMessage('');
    completedRef.current = false;
    setState('idle');
  };

  const onWatchAndEarn = useCallback(async () => {
    if (active === null) return;
    try {
      const result = await client.post<{ watchId: string }>('/video-watches', { videoId: active.id });
      setWatchId(result.watchId);
      setState('loading');
      videoRef.current?.play().catch(() => undefined);
    } catch {
      setState('error');
    }
  }, [client, active]);

  const onPlay = () => {
    setState('playing');
    if (heartbeatTimer.current === null && watchId !== null) {
      heartbeatTimer.current = setInterval(() => {
        const position = Math.round(videoRef.current?.currentTime ?? 0);
        client
          .post<{ verifiedSeconds: number }>(`/video-watches/${watchId}/heartbeat`, { timestamp: new Date().toISOString(), watchPosition: position })
          .catch((error: unknown) => {
            if (error instanceof ApiRequestError && error.code === 'WATCH_FRAUD_SUSPECT') {
              stopHeartbeat();
              setState('fraud-blocked');
            }
          });
      }, HEARTBEAT_MS);
    }
  };

  const onPause = () => {
    setState('paused');
    stopHeartbeat();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{t('videos.title')}</h1>

      {/* aria-live region for earned-points announcements (§10.4) */}
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {active !== null && (
        <div className="rounded-2xl bg-ink-950 p-4" style={{ borderRadius: 'var(--radius-consumer)' }}>
          <p className="mb-2 font-semibold text-white">{active.title}</p>

          {state === 'error' && <p className="text-danger">{t('player.state.error')}</p>}
          {state === 'fraud-blocked' && (
            <p role="status" className="text-danger">
              {t('player.state.fraudBlocked')}
            </p>
          )}
          {state === 'earned' && (
            <p role="status" className="text-[var(--consumer-accent)] text-xl font-bold">
              {earnedPoints !== null ? t('player.state.earned', { points: earnedPoints }) : t('videos.hiddenOpportunity')}
            </p>
          )}
          {state !== 'earned' && state !== 'fraud-blocked' && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- demo content, no captions track available */}
              <video
                ref={videoRef}
                src={active.url}
                controls
                autoPlay={false}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={() => void finish()}
                className="w-full rounded-xl bg-black"
                aria-label={active.title}
              />
              <p className="mt-2 text-center font-bold text-[var(--consumer-accent)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t('player.pointsCounter', { points: active.resolvedPointsPerView })}
              </p>
              {watchId === null ? (
                <Button className="mt-2 w-full" onClick={() => void onWatchAndEarn()}>
                  {t('player.cta.watchAndEarn')}
                </Button>
              ) : (
                <Button variant="secondary" className="mt-2 w-full" onClick={() => void finish()}>
                  {t('wallet.earn')}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {loadError !== null && <p className="text-sm text-danger">{loadError}</p>}
      {videos === null && loadError === null && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {videos !== null && videos.length === 0 && <p className="text-text-secondary">{t('videos.empty.body')}</p>}

      {videos !== null && videos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => openVideo(video)}
              className="rounded-2xl bg-surface-1 p-3 text-left shadow-sh-1 transition-colors hover:bg-surface-2"
              style={{ borderRadius: 'var(--radius-consumer)' }}
            >
              <div className="mb-2 aspect-video rounded-lg bg-surface-2" />
              <p className="truncate text-sm font-semibold text-text-primary">{video.title}</p>
              <Badge tone={video.resolvedPointsPerView > 0 ? 'brand' : 'neutral'}>
                {video.resolvedPointsPerView > 0 ? t('videos.pointsBadge', { points: video.resolvedPointsPerView }) : t('videos.hiddenOpportunity')}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
