import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Button } from 'react-native';
import type { CountryDetectionResult } from '@marketplace/shared';
import { apiClient } from '../lib/api-client';

/**
 * The Phase 1 country-detection screen, extracted unchanged out of App.tsx
 * so App.tsx can switch between this and the Phase 2 Products/Categories
 * screens (see docs/marketplace/PHASE_2_REPORT.md for why a simple local
 * tab switcher was used instead of adding a navigation library this pass).
 */
export function HomeScreen() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: CountryDetectionResult }
  >({ status: 'loading' });

  const load = () => {
    setState({ status: 'loading' });
    apiClient
      .detectCountry()
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
  };

  useEffect(load, []);

  return (
    <View style={styles.container}>
      {state.status === 'loading' && <ActivityIndicator testID="loading-indicator" />}

      {state.status === 'error' && (
        <View>
          <Text style={styles.error}>{state.message}</Text>
          <Button title="Retry" onPress={load} />
        </View>
      )}

      {state.status === 'success' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {state.data.countryName} ({state.data.countryCode})
          </Text>
          <Text>Currency: {state.data.currency}</Text>
          <Text>Language: {state.data.language}</Text>
          <Text>Timezone: {state.data.timezone}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  error: { color: '#b91c1c', marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 16, gap: 4 },
  cardTitle: { fontWeight: '600', fontSize: 16, marginBottom: 4 },
});
