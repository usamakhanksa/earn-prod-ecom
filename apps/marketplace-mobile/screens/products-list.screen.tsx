import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import type { PaginatedProducts } from '@marketplace/shared';
import { apiClient } from '../lib/api-client';

/**
 * Real products list screen — read-only this phase, consuming the exact
 * same marketplace-api /api/products endpoint (via the shared typed
 * client) that marketplace-web's /products page uses, so the data is
 * provably the same across platforms. No cart/favorite actions here (those
 * systems don't exist yet — see docs/marketplace/DEBT.md), no new backend
 * surface was added for mobile.
 */
export function ProductsListScreen() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: PaginatedProducts }
  >({ status: 'loading' });

  const load = () => {
    setState({ status: 'loading' });
    apiClient
      .listProducts({ limit: 20 })
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' }),
      );
  };

  useEffect(load, []);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="products-loading-indicator" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{state.message}</Text>
        <Button title="Retry" onPress={load} />
      </View>
    );
  }

  if (state.data.items.length === 0) {
    return (
      <View style={styles.center}>
        <Text>No products available in this country yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={state.data.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.row}>
          {item.images[0] ? (
            <Image source={{ uri: item.images[0] }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
          )}
          <View style={styles.rowText}>
            <Text style={styles.title} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.meta}>
              {item.category?.name ?? 'Uncategorized'} · {item.price.toFixed(2)} {item.currency}
            </Text>
            {item.rating !== null && (
              <Text style={styles.meta}>
                ★ {item.rating.toFixed(1)} ({item.ratingCount})
              </Text>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  error: { color: '#b91c1c' },
  list: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 12 },
  thumbnail: { width: 56, height: 56, borderRadius: 8 },
  thumbnailPlaceholder: { backgroundColor: '#e5e7eb' },
  rowText: { flex: 1, gap: 2 },
  title: { fontWeight: '600' },
  meta: { color: '#666', fontSize: 12 },
});
