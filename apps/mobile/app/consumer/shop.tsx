import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { confirmRedeem, fetchProducts, fetchWallet, previewRedeem, type ProductSummary } from '@/lib/points-api';

type LoadState = 'loading' | 'ready' | 'error';
const POINTS_STEP = 100;

/** Real consumer shop browse + points redemption (docs/points-extension.md
 * §10.3, C-11/C-4, closes docs/DEBT.md 0-D7 for this file). A points
 * "slider" here is a stepper (no native slider dependency in this app) —
 * constrained the same way a real slider would be: the PREVIEW call is the
 * source of truth for the floor/share-cap/balance checks (§7.4), not a
 * client-side guess, since a consumer role cannot read `TenantPointSettings`
 * directly (that's an admin/finance surface). */
export default function ShopScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [state, setState] = useState<LoadState>('loading');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [balance, setBalance] = useState<string>('0');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [points, setPoints] = useState(POINTS_STEP);
  const [preview, setPreview] = useState<{ discountCurrencyMinor: string; afterDiscountMinor: string; currency: string } | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [confirmedPurchaseId, setConfirmedPurchaseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [productsPage, wallet] = await Promise.all([fetchProducts(client), fetchWallet(client)]);
      setProducts(productsPage.items);
      setBalance(wallet.balance);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const openRedeem = (productId: string) => {
    setExpandedId(productId);
    setPoints(POINTS_STEP);
    setPreview(null);
    setRedeemError(null);
    setConfirmedPurchaseId(null);
  };

  const runPreview = useCallback(
    async (productId: string, pointsToUse: number) => {
      setRedeemError(null);
      try {
        setPreview(await previewRedeem(client, productId, pointsToUse));
      } catch (error) {
        setPreview(null);
        setRedeemError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
      }
    },
    [client, t],
  );

  const runConfirm = useCallback(
    async (productId: string, pointsToUse: number) => {
      try {
        const result = await confirmRedeem(client, productId, pointsToUse, randomUUID());
        setConfirmedPurchaseId(result.purchaseId);
        setBalance(result.balanceAfter);
      } catch (error) {
        setRedeemError(error instanceof ApiRequestError ? error.message : t('errors.generic'));
      }
    },
    [client, t],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {t('shop.title')}
        </Text>
        <Text style={styles.balanceStrip}>{t('wallet.balanceLabel')}: {balance}</Text>

        {state === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.muted}>{t('shop.loading')}</Text>
          </View>
        )}
        {state === 'error' && <Text style={styles.errorTitle}>{t('shop.error.title')}</Text>}
        {state === 'ready' && products.length === 0 && <Text style={styles.muted}>{t('shop.empty.title')}</Text>}

        {state === 'ready' && products.length > 0 && (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <TouchableOpacity accessibilityRole="button" onPress={() => openRedeem(item.id)}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardPrice}>
                    {(Number(item.priceMinor) / 100).toFixed(2)} {item.currency}
                  </Text>
                  <Text style={styles.pointsBadge}>{t('shop.pointsDiscountBadge', { amount: `${(Number(item.priceMinor) / 200).toFixed(2)} ${item.currency}` })}</Text>
                </TouchableOpacity>

                {expandedId === item.id && (
                  <View style={styles.redeemPanel}>
                    <Text accessibilityLabel={t('shop.redeem.sliderLabel')} style={styles.redeemLabel}>
                      {t('shop.redeem.sliderLabel')}: {points}
                    </Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="-100"
                        style={styles.stepperButton}
                        onPress={() => setPoints((p) => Math.max(POINTS_STEP, p - POINTS_STEP))}
                      >
                        <Text style={styles.stepperLabel}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{points}</Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="+100"
                        style={styles.stepperButton}
                        onPress={() => setPoints((p) => p + POINTS_STEP)}
                      >
                        <Text style={styles.stepperLabel}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity accessibilityRole="button" style={styles.previewButton} onPress={() => void runPreview(item.id, points)}>
                      <Text style={styles.previewLabel}>{t('shop.redeem.previewDiscount', { amount: '' })}</Text>
                    </TouchableOpacity>

                    {redeemError !== null && <Text style={styles.errorTitle}>{redeemError}</Text>}

                    {preview !== null && confirmedPurchaseId === null && (
                      <View style={styles.previewResult}>
                        <Text>{t('shop.redeem.previewDiscount', { amount: `${(Number(preview.discountCurrencyMinor) / 100).toFixed(2)} ${preview.currency}` })}</Text>
                        <Text>{t('shop.redeem.afterDiscount', { amount: `${(Number(preview.afterDiscountMinor) / 100).toFixed(2)} ${preview.currency}` })}</Text>
                        <TouchableOpacity accessibilityRole="button" style={styles.confirmButton} onPress={() => void runConfirm(item.id, points)}>
                          <Text style={styles.confirmLabel}>{t('shop.redeem.confirm')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {confirmedPurchaseId !== null && <Text style={styles.successText}>{t('player.state.earned', { points: '' }).split('!')[0]}</Text>}
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFBFA' },
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  balanceStrip: { color: '#333a47', fontVariant: ['tabular-nums'] },
  muted: { color: '#6b7484' },
  centered: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  errorTitle: { color: '#e5484d', fontWeight: '600' },
  card: { backgroundColor: '#ffffff', borderRadius: 18, padding: 14, marginBottom: 10 },
  cardTitle: { fontWeight: '700', fontSize: 16 },
  cardPrice: { color: '#333a47', marginTop: 2 },
  pointsBadge: { color: '#d98a1e', fontWeight: '700', marginTop: 4 },
  redeemPanel: { marginTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#e7eaf0', paddingTop: 12 },
  redeemLabel: { fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eef0ff', alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { fontSize: 20, fontWeight: '700', color: '#3b4be8' },
  stepperValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 60, textAlign: 'center' },
  previewButton: { backgroundColor: '#171b23', borderRadius: 18, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  previewLabel: { color: '#fff', fontWeight: '700' },
  previewResult: { gap: 6 },
  confirmButton: { backgroundColor: '#f2a73b', borderRadius: 18, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  confirmLabel: { color: '#101319', fontWeight: '800' },
  successText: { color: '#12a150', fontWeight: '700' },
});
