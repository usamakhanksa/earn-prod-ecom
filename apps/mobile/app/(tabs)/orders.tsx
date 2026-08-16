import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import type { OrderSummary } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { listOrdersOfflineAware, syncOfflineQueue } from '@/lib/orders-api';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Real order feed (featureslist.md 6.1/6.13, task 5.13) — closes the
 * `ComingSoon` placeholder this tab held since Phase 0/1. Reads through
 * `listOrdersOfflineAware` (falls back to the last cached page when the
 * network is unreachable, task 5.13's "offline cache") and flushes any
 * queued mutations (`syncOfflineQueue`) on every screen focus/pull-to-refresh.
 */
export default function OrdersScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [state, setState] = useState<LoadState>('loading');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const sync = await syncOfflineQueue(client).catch(() => null);
      if (sync !== null && (sync.synced > 0 || sync.conflicted > 0)) {
        setSyncNote(t('mobileOrders.syncSummary', { synced: sync.synced, conflicted: sync.conflicted }));
      }
      const result = await listOrdersOfflineAware(client);
      setOrders(result.items);
      setFromCache(result.fromCache);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {t('mobileOrders.title')}
        </Text>
        {fromCache && (
          <Text style={styles.offlineBanner} accessibilityRole="alert">
            {t('mobileOrders.offlineBanner')}
          </Text>
        )}
        {syncNote !== null && <Text style={styles.syncBanner}>{syncNote}</Text>}

        {state === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
          </View>
        )}

        {state === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>{t('common.error')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryLabel}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'ready' && orders.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.muted}>{t('mobileOrders.empty')}</Text>
          </View>
        )}

        {state === 'ready' && orders.length > 0 && (
          <FlatList
            data={orders}
            keyExtractor={(item) => item.id}
            onRefresh={() => void load()}
            refreshing={false}
            renderItem={({ item }) => (
              <TouchableOpacity accessibilityRole="button" style={styles.row} onPress={() => router.push(`/orders/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                  <Text style={styles.muted}>{item.buyerName ?? item.buyerEmail ?? '—'}</Text>
                </View>
                <Text style={styles.status}>{t(`orders.status.${item.status}`)}</Text>
                {item.openExceptionCount > 0 && <Text style={styles.badge}>{item.openExceptionCount}</Text>}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0C10' },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#F6F7FA', marginBottom: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: '#6B7484', fontSize: 13 },
  errorTitle: { color: '#E5484D', fontSize: 15, fontWeight: '600' },
  retryButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#3B4BE8', borderRadius: 8 },
  retryLabel: { color: 'white', fontWeight: '600' },
  offlineBanner: { color: '#D98A1E', fontSize: 12, marginBottom: 4 },
  syncBanner: { color: '#12A150', fontSize: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#232833', gap: 8 },
  orderNumber: { color: '#F6F7FA', fontWeight: '600' },
  status: { color: '#C9CFDA', fontSize: 12 },
  badge: { color: 'white', backgroundColor: '#E5484D', fontSize: 11, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
});
