import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ProductSummary } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';

/** Product read view (featureslist.md 2.13 — "read-only, no builder on
 * mobile this phase"). The builder flow (blueprint -> matrix -> placement ->
 * pricing) is web-only per this phase's own exit criteria. */
export default function CatalogProductsScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const router = useRouter();

  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const page = await client.get<{ items: ProductSummary[] }>('/products', { limit: 30 });
      setProducts(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('mobile.catalogProducts.loadError'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('mobile.catalogProducts.title')}</Text>
        <Text style={styles.note}>{t('mobile.catalogProducts.readOnlyNote')}</Text>
      </View>

      {loadError !== null ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : products === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : products.length === 0 ? (
        <Text style={styles.muted}>{t('mobile.catalogProducts.empty')}</Text>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.row}
              onPress={() => router.push(`/more/catalog-products/${item.id}`)}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.sku} · {t('mobile.catalogProducts.variantsCount', { count: item.variantCount })}
                </Text>
              </View>
              <Badge status={item.status} label={t(`catalog.products.status.${item.status}`)} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Badge({ status, label }: { status: string; label: string }) {
  const color = status === 'ACTIVE' ? '#12A150' : status === 'DRAFT' ? '#D98A1E' : '#6B7484';
  return (
    <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  header: { padding: 16, gap: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  note: { fontSize: 12, color: '#6b7484' },
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
