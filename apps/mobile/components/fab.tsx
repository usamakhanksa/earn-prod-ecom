import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { createTranslator, type Locale } from '@omnisell/i18n';

/** Contextual FAB per tab (featureslist.md §0.3 — "Home → New Product, Studio
 * → Camera/Upload, Orders → Scan tracking"). The actions themselves are
 * Phase 2+ scope; tapping honestly says so rather than doing nothing silently
 * or faking success. */
export function Fab({ locale, label, glyph }: { locale: Locale; label: string; glyph: string }) {
  const { t } = createTranslator(locale);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.fab}
      onPress={() => Alert.alert(label, t('comingSoon.body'))}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    end: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b4be8',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  glyph: { color: '#fff', fontSize: 24, lineHeight: 24 },
});
