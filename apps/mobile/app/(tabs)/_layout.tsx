import { ActivityIndicator, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';
import { useBiometricGate } from '@/lib/use-biometric-gate';

/**
 * Bottom tabs (prompt.md Phase 1.9 / featureslist.md §0.3 — "Home · Listings ·
 * Orders · Studio · More"). Wrapped in the biometric re-lock gate: a user who
 * opted into biometric unlock sees a lock screen here on every cold app open,
 * even though the JWT session itself is already valid (session ≠ "unlocked
 * this launch") — see lib/use-biometric-gate.ts for the untested-on-device
 * caveat (docs/DEBT.md).
 */
export default function TabsLayout() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { status, retry } = useBiometricGate();

  if (status === 'checking') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === 'locked') {
    return <LockedScreen locale={locale} onRetry={retry} />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: t('nav.dashboard') }} />
      <Tabs.Screen name="listings" options={{ title: t('nav.listings.title') }} />
      <Tabs.Screen name="orders" options={{ title: t('nav.ordersGroup.title') }} />
      <Tabs.Screen name="studio" options={{ title: t('nav.studio.title') }} />
      <Tabs.Screen name="more" options={{ title: t('nav.more') }} />
    </Tabs>
  );
}

function LockedScreen({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const { t } = createTranslator(locale);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>{t('mobile.locked.title')}</Text>
      <Text
        accessibilityRole="button"
        onPress={onRetry}
        style={{ color: '#3b4be8', fontWeight: '600', padding: 8 }}
      >
        {t('mobile.locked.retry')}
      </Text>
    </View>
  );
}
