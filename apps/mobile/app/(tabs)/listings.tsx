import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ListingStatus, ListingSummary } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';

/**
 * Listings tab (implentationplanphase.md task 4.14) — read-mostly list with
 * a status filter, tapping through to the detail screen for the two real
 * mutations mobile supports this phase: approve/reject and retry. No
 * composer on mobile (builder flows are web-first, same scope decision
 * Phase 2 made for Catalog).
 */
const FILTERS: Array<{ key: string; status?: ListingStatus }> = [
  { key: 'all' },
  { key: 'pending', status: 'PENDING' },
  { key: 'live', status: 'LIVE' },
  { key: 'error', status: 'ERROR' },
];

export default function ListingsScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const router = useRouter();

  const [filter, setFilter] = useState<string>('all');
  const [listings, setListings] = useState<ListingSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const active = FILTERS.find((f) => f.key === filter);
      const page = await client.get<{ items: ListingSummary[] }>('/listings', active?.status !== undefined ? { status: active.status } : undefined);
      setListings(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('mobile.listings.loadError'));
    }
  }, [client, filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('mobile.listings.title')}</Text>
      </View>

      <View style={styles.filterRow} accessibilityRole="tablist">
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            style={[styles.filterChip, filter === f.key ? styles.filterChipActive : null]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key ? styles.filterChipTextActive : null]}>{t(`mobile.listings.filter.${f.key}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadError !== null ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : listings === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : listings.length === 0 ? (
        <Text style={styles.muted}>{t('mobile.listings.empty')}</Text>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity accessibilityRole="button" style={styles.row} onPress={() => router.push(`/listings/${item.id}`)}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.title}</Text>
                <Text style={styles.rowMeta}>{item.connectionLabel}</Text>
              </View>
              <Badge status={item.status} label={t(`listings.status.${item.status}`)} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Badge({ status, label }: { status: string; label: string }) {
  const color = status === 'LIVE' ? '#12A150' : status === 'ERROR' || status === 'REJECTED' ? '#E5484D' : status === 'QUEUED' || status === 'PENDING' ? '#D98A1E' : '#6B7484';
  return (
    <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  header: { padding: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  filterChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#e7eaf0' },
  filterChipActive: { backgroundColor: '#4F5FF5', borderColor: '#4F5FF5' },
  filterChipText: { fontSize: 12, color: '#333A47' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  muted: { color: '#6b7484', paddingHorizontal: 16 },
  error: { color: '#e5484d', paddingHorizontal: 16 },
  spinner: { marginTop: 24 },
  list: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7eaf0',
    padding: 12,
    backgroundColor: '#fff',
  },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: '#6b7484', marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
