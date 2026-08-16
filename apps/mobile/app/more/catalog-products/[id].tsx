import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ProductDetail } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';

/** Read-only product detail (featureslist.md 2.13). Mirrors the web
 * builder's data shape but renders it, never edits it — the builder flow is
 * web-only this phase. */
export default function ProductDetailScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (id === undefined) return;
    client
      .get<ProductDetail>(`/products/${id}`)
      .then(setProduct)
      .catch((error: unknown) => setLoadError(error instanceof ApiRequestError ? error.message : t('mobile.catalogProducts.loadError')));
  }, [client, id, t]);

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.error}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  if (product === null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.spinner} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{product.name}</Text>
        <Text style={styles.meta}>{product.sku}</Text>
        {product.description !== null ? <Text style={styles.description}>{product.description}</Text> : null}

        <Text style={styles.sectionTitle}>{t('catalog.builder.matrixSection')}</Text>
        {product.variants.map((variant) => (
          <View key={variant.id} style={styles.variantRow}>
            <Text style={styles.variantSku}>{variant.sku}</Text>
            <Text style={styles.variantMeta}>
              {variant.size} · {variant.color} · {variant.isEnabled ? '✓' : '—'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { padding: 16, gap: 6 },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b7484' },
  description: { marginTop: 8, fontSize: 14 },
  sectionTitle: { marginTop: 16, fontSize: 14, fontWeight: '700' },
  variantRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e7eaf0' },
  variantSku: { fontSize: 13, fontWeight: '600' },
  variantMeta: { fontSize: 12, color: '#6b7484' },
  error: { color: '#e5484d', padding: 16 },
  spinner: { marginTop: 24 },
});
