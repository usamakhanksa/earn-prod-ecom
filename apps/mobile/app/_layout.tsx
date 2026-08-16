import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SessionProvider, useSession } from '@/lib/session-context';

export default function RootLayout() {
  return (
    <SessionProvider>
      <AuthGate />
      <StatusBar style="auto" />
    </SessionProvider>
  );
}

/**
 * Redirects into/out of the `(tabs)` group based on session state (prompt.md
 * Phase 1.9). Biometric re-lock (featureslist.md 1.6) is a separate concern
 * layered on top in `app/(tabs)/_layout.tsx` — this gate only decides
 * "logged in or not", not "unlocked this launch or not".
 */
function AuthGate() {
  const { isLoading, user } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const inAuthGroup = segments[0] === '(tabs)' || segments[0] === 'consumer' || segments[0] === 'more';
    if (user === null && inAuthGroup) {
      router.replace('/login');
    } else if (user !== null && segments[0] === 'login') {
      router.replace('/');
    }
  }, [isLoading, router, segments, user]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f7fa' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f6f7fa' },
      }}
    />
  );
}
