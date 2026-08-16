import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { createTranslator } from '@omnisell/i18n';
import type { OrderDetail } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { fulfilOrderOfflineAware, getOrderDetail } from '@/lib/orders-api';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Order detail + fulfil action + exception visibility (featureslist.md
 * 6.5/6.7, task 5.13). The fulfil button is offline-aware: a real network
 * failure queues the mutation (task 5.13) instead of failing the tap.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [state, setState] = useState<LoadState>('loading');
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setOrder(await getOrderDetail(client, id));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [client, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFulfil(): Promise<void> {
    setBusy(true);
    setActionNote(null);
    try {
      const idempotencyKey = Crypto.randomUUID();
      const result = await fulfilOrderOfflineAware(client, id, idempotencyKey);
      setActionNote(result.queued ? t('mobileOrders.detail.queuedOffline') : t('mobileOrders.detail.fulfilSuccess'));
      if (!result.queued) await load();
    } catch {
      setActionNote(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        {state === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
          </View>
        )}
        {state === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>{t('mobileOrders.detail.notFound')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryLabel}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {state === 'ready' && order !== null && (
          <>
            <Text style={styles.title} accessibilityRole="header">{order.orderNumber}</Text>
            <Text style={styles.muted}>{order.buyerName ?? order.buyerEmail ?? '—'}</Text>
            <Text style={styles.status}>{t(`orders.status.${order.status}`)}</Text>

            <TouchableOpacity accessibilityRole="button" style={styles.actionButton} onPress={() => void onFulfil()} disabled={busy}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.retryLabel}>{t('mobileOrders.detail.fulfil')}</Text>}
            </TouchableOpacity>
            {actionNote !== null && <Text style={styles.syncBanner}>{actionNote}</Text>}

            <Text style={styles.sectionHeader}>{t('mobileOrders.detail.items')}</Text>
            {order.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.muted}>×{item.quantity}</Text>
              </View>
            ))}

            <Text style={styles.sectionHeader}>{t('mobileOrders.detail.exceptions')}</Text>
            {order.exceptions.length === 0 ? (
              <Text style={styles.muted}>{t('orders.detail.noExceptions')}</Text>
            ) : (
              order.exceptions.map((exception) => (
                <View key={exception.id} style={styles.itemRow}>
                  <Text style={styles.itemTitle}>{t(`orders.exceptions.type.${exception.type}`)}</Text>
                  <Text style={styles.muted}>{exception.message}</Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0C10' },
  container: { padding: 16, gap: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 64 },
  title: { fontSize: 22, fontWeight: '700', color: '#F6F7FA' },
  muted: { color: '#6B7484', fontSize: 13 },
  status: { color: '#7A86FF', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  errorTitle: { color: '#E5484D', fontSize: 15, fontWeight: '600' },
  retryButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#3B4BE8', borderRadius: 8, alignItems: 'center' },
  actionButton: { marginVertical: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#3B4BE8', borderRadius: 8, alignItems: 'center' },
  retryLabel: { color: 'white', fontWeight: '600' },
  syncBanner: { color: '#12A150', fontSize: 12, marginBottom: 8 },
  sectionHeader: { color: '#C9CFDA', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#232833' },
  itemTitle: { color: '#F6F7FA', fontSize: 13, flexShrink: 1 },
});
