import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTranslator } from '@omnisell/i18n';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { fetchWallet, fetchWalletTransactions, type PointTransactionView, type WalletView } from '@/lib/points-api';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Real wallet screen (docs/points-extension.md §10.3, closes docs/DEBT.md
 * 0-D7 for this file). Derived balance (tabular numerals via monospace font
 * so digits align), a "today's earned vs cap" meter, transaction history
 * with loading/empty/error states, and an expiry warning when applicable.
 */
export default function WalletScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [state, setState] = useState<LoadState>('loading');
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [transactions, setTransactions] = useState<PointTransactionView[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [walletView, txPage] = await Promise.all([fetchWallet(client), fetchWalletTransactions(client)]);
      setWallet(walletView);
      setTransactions(txPage.items);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const cap = wallet !== null ? Math.max(Number(wallet.todayEarned), 1) : 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {t('wallet.title')}
        </Text>

        {state === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.muted}>{t('wallet.loading')}</Text>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>{t('wallet.error.title')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryLabel}>{t('wallet.error.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'ready' && wallet !== null && (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>{t('wallet.balanceLabel')}</Text>
              <Text style={styles.balanceValue} accessibilityLabel={`${wallet.balance} ${t('wallet.balanceUnit')}`}>
                {wallet.balance}
              </Text>
              <Text style={styles.balanceUnit}>{t('wallet.balanceUnit')}</Text>
            </View>

            <View style={styles.meter}>
              <Text style={styles.meterLabel}>
                {t('wallet.todayEarnedOfCap', { earned: wallet.todayEarned, cap: wallet.todayCapped ? wallet.todayEarned : '500' })}
              </Text>
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: `${Math.min(100, (Number(wallet.todayEarned) / (wallet.todayCapped ? cap : 500)) * 100)}%` }]} />
              </View>
            </View>

            {wallet.nextExpiry !== null && (
              <Text style={styles.expiryWarning}>
                {t('wallet.expiry.warning', { amount: wallet.nextExpiry.amount, date: new Date(wallet.nextExpiry.at).toLocaleDateString(locale) })}
              </Text>
            )}

            {wallet.balance === '0' && transactions.length === 0 && (
              <View style={styles.onboarding}>
                <Text style={styles.onboardingTitle}>{t('wallet.onboarding.title')}</Text>
                <Text style={styles.muted}>{t('wallet.onboarding.body')}</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>{t('wallet.transactions.title')}</Text>
            {transactions.length === 0 ? (
              <Text style={styles.muted}>{t('wallet.transactions.empty.body')}</Text>
            ) : (
              <FlatList
                data={transactions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.txRow}>
                    <View>
                      <Text style={styles.txSource}>{item.source}</Text>
                      <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString(locale)}</Text>
                    </View>
                    <Text style={[styles.txAmount, item.amount.startsWith('-') ? styles.txNegative : styles.txPositive]}>{item.amount}</Text>
                  </View>
                )}
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFBFA' },
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#6b7484' },
  centered: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  errorTitle: { color: '#e5484d', fontWeight: '600' },
  retryButton: { backgroundColor: '#f2a73b', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  retryLabel: { color: '#101319', fontWeight: '700' },
  balanceCard: { backgroundColor: '#171b23', borderRadius: 18, padding: 20, alignItems: 'center', gap: 4 },
  balanceLabel: { color: '#c9cfda', fontSize: 13 },
  balanceValue: { color: '#ffffff', fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  balanceUnit: { color: '#c9cfda', fontSize: 13 },
  meter: { gap: 6 },
  meterLabel: { fontSize: 13, color: '#333a47' },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: '#e7eaf0', overflow: 'hidden' },
  meterFill: { height: 8, backgroundColor: '#f2a73b' },
  expiryWarning: { color: '#d98a1e', fontSize: 13 },
  onboarding: { backgroundColor: '#eef0ff', borderRadius: 18, padding: 16, gap: 4 },
  onboardingTitle: { fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e7eaf0' },
  txSource: { fontWeight: '600' },
  txDate: { fontSize: 12, color: '#6b7484' },
  txAmount: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  txPositive: { color: '#12a150' },
  txNegative: { color: '#e5484d' },
});
