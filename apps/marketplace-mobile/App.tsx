import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, ActivityIndicator, Button } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { CountryDetectionResult } from '@marketplace/shared';
import { apiClient } from './lib/api-client';

/**
 * Minimal Phase 1 screen: proves marketplace-mobile can reach the exact
 * same marketplace-api as marketplace-web through the shared typed
 * client, with real loading/error/success states. Login/register screens
 * follow the same web pattern in a later pass (see docs/marketplace/DEBT.md).
 */
export default function App() {
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
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>GlobalMart</Text>
      <Text style={styles.subtitle}>Country-aware marketplace — mobile (Phase 1)</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#666', marginBottom: 16, textAlign: 'center' },
  error: { color: '#b91c1c', marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 16, gap: 4 },
  cardTitle: { fontWeight: '600', fontSize: 16, marginBottom: 4 },
});
