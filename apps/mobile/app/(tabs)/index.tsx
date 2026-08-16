import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTranslator } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { Fab } from '@/components/fab';

export default function HomeScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { user, tenants } = useSession();
  const currentTenant = tenants[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('nav.dashboard')}</Text>
        <Text style={styles.muted}>
          {t('dashboard.greeting', { name: user?.name ?? user?.email ?? '' })}
          {currentTenant !== undefined ? ` · ${currentTenant.name}` : ''}
        </Text>
      </View>
      <Fab locale={locale} label={t('mobile.fab.newProduct')} glyph="+" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#6b7484' },
});
