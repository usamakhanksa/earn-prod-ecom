import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTranslator, LOCALES } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';

const LABELS: Record<string, string> = { en: 'English', ar: 'العربية' };

/**
 * Real (not stubbed) locale switch — resolves docs/OPEN_QUESTIONS.md #9.
 * React Native's RTL mirroring (`I18nManager`) only fully applies after an
 * app reload — a well-known upstream constraint, not something this screen
 * can paper over. The note below is honest about that instead of silently
 * mirroring nothing.
 */
export default function LanguageScreen() {
  const [locale, setLocale] = useLocale();
  const { t } = createTranslator(locale);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('mobile.more.language')}</Text>
        {LOCALES.map((candidate) => (
          <TouchableOpacity
            key={candidate}
            accessibilityRole="button"
            accessibilityState={{ selected: candidate === locale }}
            style={[styles.row, candidate === locale ? styles.rowActive : null]}
            onPress={() => setLocale(candidate)}
          >
            <Text style={styles.rowLabel}>{LABELS[candidate]}</Text>
            {candidate === locale ? <Text style={styles.check}>✓</Text> : null}
          </TouchableOpacity>
        ))}
        <Text style={styles.note}>{t('mobile.more.languageRestartNote')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowActive: { borderWidth: 1, borderColor: '#3b4be8' },
  rowLabel: { fontSize: 15 },
  check: { color: '#3b4be8', fontWeight: '700' },
  note: { marginTop: 12, color: '#6b7484', fontSize: 12 },
});
