import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { MORE_SECTIONS } from '@/lib/more-nav-data';

/** The "More" drawer (featureslist.md §0.3). See lib/more-nav-data.ts's doc
 * comment for why this mirrors the web sidebar tree by construction. */
export default function MoreScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { user, logout } = useSession();

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.container}>
      <Text style={styles.email}>{user?.email}</Text>

      {MORE_SECTIONS.map((section) => (
        <View key={section.key} style={styles.section}>
          <Text style={styles.sectionTitle}>{t(section.labelKey)}</Text>
          {section.rows.map((row) => (
            <Link key={row.key} href={row.href} asChild>
              <TouchableOpacity accessibilityRole="button" style={styles.row}>
                <Text style={styles.rowLabel}>{t(row.labelKey)}</Text>
                <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
                  ›
                </Text>
              </TouchableOpacity>
            </Link>
          ))}
        </View>
      ))}

      <TouchableOpacity accessibilityRole="button" style={styles.logout} onPress={() => void logout()}>
        <Text style={styles.logoutLabel}>{t('nav.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  email: { color: '#6b7484', fontSize: 13 },
  section: { gap: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7484', textTransform: 'uppercase', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 15, color: '#101319' },
  chevron: { color: '#6b7484', fontSize: 18 },
  logout: { alignItems: 'center', paddingVertical: 14 },
  logoutLabel: { color: '#e5484d', fontWeight: '600' },
});
