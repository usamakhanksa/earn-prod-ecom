import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ListingDetail } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';

/**
 * Listing status detail (implentationplanphase.md task 4.14) — the two real
 * mutations mobile supports this phase: approve/reject (wired to the same
 * approval-workflow endpoints the web app uses) and retry.
 */
export default function ListingDetailScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id === undefined) return;
    try {
      setListing(await client.get<ListingDetail>(`/listings/${id}`));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('mobile.listings.loadError'));
    }
  }, [client, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(key: string, fn: () => Promise<unknown>): Promise<void> {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.error}>{loadError}</Text>
      </SafeAreaView>
    );
  }
  if (listing === null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.spinner} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.meta}>
          {listing.productName} → {listing.connectionLabel}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={styles.statusText}>{t(`listings.status.${listing.status}`)}</Text>
          <Text style={styles.statusText}>{t(`listings.approval.${listing.approvalStatus}`)}</Text>
        </View>

        {listing.status === 'ERROR' ? (
          <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} disabled={busy === 'retry'} onPress={() => void runAction('retry', () => client.post(`/listings/${id}/retry`, {}))}>
            <Text style={styles.primaryButtonText}>{busy === 'retry' ? t('common.loading') : t('listings.detail.retryButton')}</Text>
          </TouchableOpacity>
        ) : null}

        {listing.approvalStatus === 'SUBMITTED' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.primaryButton}
              disabled={busy === 'approve'}
              onPress={() => void runAction('approve', () => client.post(`/listings/${id}/approval-decision`, { decision: 'APPROVED' }))}
            >
              <Text style={styles.primaryButtonText}>{t('listings.detail.approveButton')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.secondaryButton}
              disabled={busy === 'reject'}
              onPress={() => void runAction('reject', () => client.post(`/listings/${id}/approval-decision`, { decision: 'REJECTED' }))}
            >
              <Text style={styles.secondaryButtonText}>{t('listings.detail.rejectButton')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{t('listings.detail.variantsHeading')}</Text>
        {listing.variants.map((variant) => (
          <View key={variant.id} style={styles.variantRow}>
            <Text style={styles.variantSku}>{variant.sku}</Text>
            <Text style={styles.variantMeta}>
              {(Number(variant.priceMinor) / 100).toFixed(2)} {variant.currency} · {variant.status}
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>{t('listings.detail.activityHeading')}</Text>
        {listing.events.map((event) => (
          <View key={event.id} style={styles.eventRow}>
            <Text style={styles.eventType}>{t(`listings.eventType.${event.type}`)}</Text>
            <Text style={styles.eventMessage}>{event.message}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { padding: 16, gap: 6 },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b7484' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#333A47' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: { backgroundColor: '#4F5FF5', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, marginTop: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryButton: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#e7eaf0', alignItems: 'center' },
  secondaryButtonText: { color: '#333A47', fontWeight: '600' },
  sectionTitle: { marginTop: 16, fontSize: 14, fontWeight: '700' },
  variantRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e7eaf0' },
  variantSku: { fontSize: 13, fontWeight: '600' },
  variantMeta: { fontSize: 12, color: '#6b7484' },
  eventRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e7eaf0' },
  eventType: { fontSize: 12, fontWeight: '700' },
  eventMessage: { fontSize: 12, color: '#6b7484' },
  error: { color: '#e5484d', padding: 16 },
  spinner: { marginTop: 24 },
});
