import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { fetchActiveVideos, type VideoContentView } from '@/lib/points-api';

type LoadState = 'loading' | 'ready' | 'error';

/** Real video feed (docs/points-extension.md §10.2/§10.3, closes docs/DEBT.md
 * 0-D7 for this file). Each card shows the resolved points opportunity (§7.1
 * — 0/hidden when no active rule, never a guessed number) and links to the
 * real player screen. */
export default function VideosScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [state, setState] = useState<LoadState>('loading');
  const [videos, setVideos] = useState<VideoContentView[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setVideos(await fetchActiveVideos(client));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {t('videos.title')}
        </Text>

        {state === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.muted}>{t('videos.loading')}</Text>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>{t('videos.error.title')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryLabel}>{t('player.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'ready' && videos.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>{t('videos.empty.title')}</Text>
            <Text style={styles.muted}>{t('videos.empty.body')}</Text>
          </View>
        )}

        {state === 'ready' && videos.length > 0 && (
          <FlatList
            data={videos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Link href={{ pathname: '/consumer/video/[id]', params: { id: item.id } }} asChild>
                <TouchableOpacity accessibilityRole="button" style={styles.card}>
                  {item.thumbnailUrl !== null && <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} accessibilityIgnoresInvertColors />}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardMeta}>
                      {item.resolvedPointsPerView > 0 ? t('videos.pointsBadge', { points: item.resolvedPointsPerView }) : t('videos.hiddenOpportunity')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Link>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFBFA' },
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#6b7484' },
  centered: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  errorTitle: { color: '#e5484d', fontWeight: '600' },
  emptyTitle: { fontWeight: '700' },
  retryButton: { backgroundColor: '#f2a73b', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  retryLabel: { color: '#101319', fontWeight: '700' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#ffffff', borderRadius: 18, padding: 12, marginBottom: 10, alignItems: 'center' },
  thumbnail: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#e7eaf0' },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontWeight: '700' },
  cardMeta: { color: '#d98a1e', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
