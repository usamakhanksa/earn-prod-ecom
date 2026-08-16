import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { AssetSummary } from '@omnisell/shared';
import { useLocale } from '@/lib/locale';
import { useSession } from '@/lib/session-context';
import { uploadAssetFromUri } from '@/lib/mobile-upload';

/**
 * Studio tab — real asset browse (read-only list backed by the API) + camera
 * capture / library upload (featureslist.md 2.3/2.13). "Auto-crop" here means
 * automatically cropping to a fixed target aspect ratio via
 * `allowsEditing`'s crop UI at capture/pick time — there is no subject-
 * detection auto-crop model in scope this phase; that distinction is
 * documented in docs/DEBT.md rather than silently overclaiming the feature.
 * Camera/library behaviour is real code, unverified on a physical device or
 * emulator in this sandbox (same standard as Phase 1's biometric unlock).
 */
export default function StudioScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const page = await client.get<{ items: AssetSummary[] }>('/assets', { limit: 30 });
      setAssets(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('mobile.studio.loadError'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function captureAndUpload(source: 'camera' | 'library'): Promise<void> {
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('mobile.studio.title'), source === 'camera' ? t('mobile.studio.cameraPermissionDenied') : t('mobile.studio.libraryPermissionDenied'));
      return;
    }

    // allowsEditing: false — this is AUTO-crop (automatic, no user
    // interaction), not the manual crop UI `allowsEditing: true` would show.
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.9 });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const picked = result.assets[0];
    if (picked === undefined) return;

    setUploading(true);
    try {
      const croppedUri = await autoCropToSquare(picked.uri, picked.width, picked.height);
      await uploadAssetFromUri(client, croppedUri, picked.fileName ?? `capture-${Date.now()}.jpg`, 'image/jpeg');
      await load();
    } catch (error) {
      Alert.alert(t('mobile.studio.title'), error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setUploading(false);
    }
  }

  /**
   * Auto-crop (featureslist.md 2.3/15.4 — "camera capture -> asset with
   * auto-crop"): centre-crops to a square automatically, no user
   * interaction. This is a deliberately simple, honest interpretation —
   * there is no subject-detection ML model in scope this phase (see
   * docs/DEBT.md); it crops the frame's centre rather than guessing where
   * the design actually is.
   */
  async function autoCropToSquare(uri: string, width: number | undefined, height: number | undefined): Promise<string> {
    if (width === undefined || height === undefined || width === height) {
      return uri;
    }
    const side = Math.min(width, height);
    const originX = Math.round((width - side) / 2);
    const originY = Math.round((height - side) / 2);
    const result = await ImageManipulator.manipulateAsync(uri, [{ crop: { originX, originY, width: side, height: side } }], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  }

  function openCaptureMenu(): void {
    Alert.alert(t('mobile.studio.title'), undefined, [
      { text: t('mobile.studio.takePhoto'), onPress: () => void captureAndUpload('camera') },
      { text: t('mobile.studio.uploadFromLibrary'), onPress: () => void captureAndUpload('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('mobile.studio.title')}</Text>
      </View>

      {loadError !== null ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : assets === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : assets.length === 0 ? (
        <Text style={styles.muted}>{t('mobile.studio.empty')}</Text>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowIcon}>{item.kind === 'IMAGE' ? '🖼️' : item.kind === 'VECTOR' ? '✒️' : '📄'}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>{t(`studio.assets.status.${item.status}`)}</Text>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('mobile.fab.cameraUpload')}
        style={styles.fab}
        onPress={openCaptureMenu}
        disabled={uploading}
      >
        {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.fabGlyph}>⚲</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  header: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#6b7484', paddingHorizontal: 16 },
  error: { color: '#e5484d', paddingHorizontal: 16 },
  spinner: { marginTop: 24 },
  list: { paddingHorizontal: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e7eaf0', padding: 10, backgroundColor: '#fff' },
  rowIcon: { fontSize: 28 },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: '#6b7484' },
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
  fabGlyph: { color: '#fff', fontSize: 24, lineHeight: 24 },
});
