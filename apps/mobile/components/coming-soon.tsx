import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTranslator, type Locale } from '@omnisell/i18n';

/** Mirrors apps/web's `(shell)/[...slug]` catch-all — an honest "coming soon"
 * state instead of mock data for every tab that has no real screen yet. */
export function ComingSoon({ locale, path }: { locale: Locale; path: string }) {
  const { t } = createTranslator(locale);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.path}>{path}</Text>
        <Text style={styles.title}>{t('comingSoon.title')}</Text>
        <Text style={styles.muted}>{t('comingSoon.body')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { padding: 16, gap: 8 },
  path: { fontSize: 12, color: '#6b7484', textTransform: 'uppercase' },
  title: { fontSize: 20, fontWeight: '700' },
  muted: { color: '#6b7484' },
});
