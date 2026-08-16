import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTranslator } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/secure-session';

/** Biometric app unlock toggle (prompt.md Phase 1.9 / featureslist.md 1.6).
 * See lib/use-biometric-gate.ts's doc comment — the on/off preference and the
 * gate that reads it are both real; only actually triggering Face/Touch ID on
 * a physical device is unverifiable in this sandbox. */
export default function BiometricSettingsScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void isBiometricUnlockEnabled().then((value) => {
      setEnabled(value);
      setLoaded(true);
    });
  }, []);

  async function toggle(value: boolean): Promise<void> {
    setEnabled(value);
    await setBiometricUnlockEnabled(value);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('mobile.more.biometric')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('mobile.biometric.toggleLabel')}</Text>
          <Switch value={enabled} onValueChange={(value) => void toggle(value)} disabled={!loaded} />
        </View>
        <Text style={styles.note}>{t('mobile.biometric.note')}</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 15 },
  note: { marginTop: 12, color: '#6b7484', fontSize: 12 },
});
