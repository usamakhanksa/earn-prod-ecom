import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { fetchActiveVideos, startWatch, sendHeartbeat, completeWatch, type VideoContentView } from '@/lib/points-api';

const HEARTBEAT_INTERVAL_MS = 5000;

/**
 * Full-screen video player (docs/points-extension.md §10.3, task 4.5.7).
 * Explicit play only — `shouldPlay={false}` initially, `useNativeControls`
 * so the user taps play themselves (no autoplay). The heartbeat loop starts
 * on play and stops on pause/navigate/background — real `POST
 * /video-watches/:id/heartbeat` calls every 5s while actually playing, never
 * while paused/buffering. States: loading / playing / paused / buffered /
 * error / earned / fraud-blocked, matching §10.3's state list exactly.
 * Earned points are announced via `AccessibilityInfo.announceForAccessibility`
 * — the RN equivalent of a web `aria-live` region.
 */
type PlayerState = 'loading' | 'playing' | 'paused' | 'buffered' | 'error' | 'earned' | 'fraud-blocked';

export default function VideoPlayerScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [video, setVideo] = useState<VideoContentView | null>(null);
  const [state, setState] = useState<PlayerState>('loading');
  const [watchId, setWatchId] = useState<string | null>(null);
  const [verifiedSeconds, setVerifiedSeconds] = useState(0);
  const [earnedPoints, setEarnedPoints] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<Video>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionSeconds = useRef(0);
  const completedRef = useRef(false);

  const stopHeartbeatLoop = useCallback(() => {
    if (heartbeatTimer.current !== null) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  const finishWatch = useCallback(async () => {
    if (watchId === null || completedRef.current) return;
    completedRef.current = true;
    stopHeartbeatLoop();
    try {
      const result = await completeWatch(client, watchId, Math.round(lastPositionSeconds.current));
      setEarnedPoints(result.earnedPoints);
      setState('earned');
      if (result.earnedPoints !== null) {
        AccessibilityInfo.announceForAccessibility(t('player.ariaLiveEarned', { points: result.earnedPoints }));
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'WATCH_FRAUD_SUSPECT') {
        setState('fraud-blocked');
      } else {
        setState('error');
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }
  }, [client, watchId, stopHeartbeatLoop, t]);

  // Load the video metadata (real, server-derived duration — §9.4).
  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const all = await fetchActiveVideos(client);
        const found = all.find((v) => v.id === id) ?? null;
        if (!cancelled) {
          setVideo(found);
          setState('paused'); // metadata loaded; player ready, waiting for explicit play
        }
      } catch (error) {
        if (!cancelled) {
          setState('error');
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id]);

  // Pause the heartbeat loop (and the player, best-effort) when the app backgrounds.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        stopHeartbeatLoop();
        void videoRef.current?.pauseAsync().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, [stopHeartbeatLoop]);

  useEffect(() => stopHeartbeatLoop, [stopHeartbeatLoop]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      lastPositionSeconds.current = status.positionMillis / 1000;

      if (status.didJustFinish) {
        void finishWatch();
        return;
      }
      if (status.isBuffering) {
        setState('buffered');
        return;
      }
      if (status.isPlaying) {
        setState('playing');
        if (heartbeatTimer.current === null && watchId !== null) {
          heartbeatTimer.current = setInterval(() => {
            void sendHeartbeat(client, watchId, Math.round(lastPositionSeconds.current))
              .then((r) => setVerifiedSeconds(r.verifiedSeconds))
              .catch((error: unknown) => {
                if (error instanceof ApiRequestError && error.code === 'WATCH_FRAUD_SUSPECT') {
                  stopHeartbeatLoop();
                  setState('fraud-blocked');
                }
              });
          }, HEARTBEAT_INTERVAL_MS);
        }
      } else {
        setState('paused');
        stopHeartbeatLoop();
      }
    },
    [client, watchId, finishWatch, stopHeartbeatLoop],
  );

  const onWatchAndEarn = useCallback(async () => {
    if (video === null) return;
    try {
      const result = await startWatch(client, video.id);
      setWatchId(result.watchId);
      await videoRef.current?.playAsync();
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [client, video]);

  if (state === 'loading' || video === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.mutedLight}>{t('player.state.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{video.title}</Text>

        {state === 'error' ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{t('player.state.error')}</Text>
            {errorMessage !== null && <Text style={styles.mutedLight}>{errorMessage}</Text>}
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => setState('paused')}>
              <Text style={styles.retryLabel}>{t('player.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : state === 'fraud-blocked' ? (
          <View style={styles.centered} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{t('player.state.fraudBlocked')}</Text>
          </View>
        ) : state === 'earned' ? (
          <View style={styles.centered} accessibilityLiveRegion="polite">
            <Text style={styles.earnedText}>
              {earnedPoints !== null ? t('player.state.earned', { points: earnedPoints }) : t('videos.hiddenOpportunity')}
            </Text>
          </View>
        ) : (
          <>
            <Video
              ref={videoRef}
              style={styles.video}
              source={{ uri: video.url }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              accessibilityLabel={video.title}
            />
            <Text style={styles.pointsCounter} accessibilityLabel={t('player.pointsCounter', { points: verifiedSeconds })}>
              {t('player.pointsCounter', { points: video.resolvedPointsPerView })}
            </Text>
            <Text style={styles.stateLabel}>
              {state === 'buffered' ? t('player.state.buffered') : state === 'playing' ? t('player.state.playing') : t('player.state.paused')}
            </Text>

            {watchId === null && (
              <TouchableOpacity accessibilityRole="button" style={styles.ctaButton} onPress={() => void onWatchAndEarn()}>
                <Text style={styles.ctaLabel}>{t('player.cta.watchAndEarn')}</Text>
              </TouchableOpacity>
            )}
            {watchId !== null && (
              <TouchableOpacity accessibilityRole="button" style={styles.finishButton} onPress={() => void finishWatch()}>
                <Text style={styles.finishLabel}>{t('wallet.earn')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0c10' },
  container: { flex: 1, padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 },
  pointsCounter: { color: '#f2a73b', fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  stateLabel: { color: '#c9cfda', textAlign: 'center' },
  mutedLight: { color: '#c9cfda' },
  errorText: { color: '#ff8b8f', fontWeight: '700', textAlign: 'center' },
  earnedText: { color: '#f2a73b', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  ctaButton: { backgroundColor: '#f2a73b', borderRadius: 18, paddingVertical: 14, alignItems: 'center', minHeight: 44 },
  ctaLabel: { color: '#101319', fontWeight: '800', fontSize: 16 },
  finishButton: { backgroundColor: '#171b23', borderRadius: 18, paddingVertical: 14, alignItems: 'center', minHeight: 44 },
  finishLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
