import * as FileSystem from 'expo-file-system';
import type { OmniSellClient } from '@omnisell/api-client';
import type { AssetSummary, UploadInitResult } from '@omnisell/shared';

/**
 * Mobile asset upload (featureslist.md 2.3/2.13 — camera capture -> asset).
 * Uses the same RESUMABLE upload path as web (docs/DEBT.md: no reachable
 * MinIO/S3 in this sandbox, so PRESIGNED mode can't be exercised here either
 * way). Unlike the desktop web uploader, this reads the WHOLE file into one
 * chunk rather than streaming fixed-size slices — real captured/picked
 * photos are a few MB at most, comfortably within what `readAsStringAsync`
 * can hold in memory, so the extra chunking complexity isn't justified here.
 */
export async function uploadAssetFromUri(
  client: OmniSellClient,
  uri: string,
  filename: string,
  mimeType: string,
): Promise<AssetSummary> {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (!info.exists || info.size === undefined) {
    throw new Error('Captured file could not be read from device storage');
  }

  const initResult = await client.post<UploadInitResult>(
    '/assets/upload-init',
    { filename, mimeType, sizeBytes: info.size, mode: 'RESUMABLE' },
    generateIdempotencyKey(),
  );
  const sessionId = initResult.uploadSessionId;
  if (sessionId === undefined) {
    throw new Error('upload-init did not return a resumable session id');
  }

  const chunkBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  await client.patch(`/assets/upload-sessions/${sessionId}`, { offsetBytes: 0, chunkBase64 });
  return client.post<AssetSummary>(`/assets/upload-sessions/${sessionId}/complete`, {});
}

function generateIdempotencyKey(): string {
  // React Native's JS engine (Hermes) supports crypto.randomUUID() on recent
  // Expo SDKs; this fallback keeps the call site safe if it's ever missing.
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID !== undefined) {
    return globalCrypto.randomUUID();
  }
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
