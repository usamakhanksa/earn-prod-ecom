import type { OmniSellClient } from '@omnisell/api-client';
import type { AssetSummary, UploadInitResult } from '@omnisell/shared';

const CHUNK_SIZE_BYTES = 512 * 1024;

/**
 * Client-side resumable upload (featureslist.md 2.2). Uses the RESUMABLE
 * mode rather than PRESIGNED because this sandbox has no reachable MinIO/S3
 * (docs/DEBT.md) — the resumable path's chunks land on the API's own local
 * scratch storage, so this is the only upload path that can actually
 * complete end-to-end here. `PRESIGNED` mode's endpoint is real and would
 * work against a live S3-compatible endpoint in production; it just can't be
 * exercised in this environment.
 */
export async function uploadFileResumable(client: OmniSellClient, file: File, folderId?: string): Promise<AssetSummary> {
  const initResult = await client.post<UploadInitResult>(
    '/assets/upload-init',
    {
      filename: file.name,
      mimeType: file.type.length > 0 ? file.type : 'application/octet-stream',
      sizeBytes: file.size,
      mode: 'RESUMABLE',
      ...(folderId !== undefined ? { folderId } : {}),
    },
    crypto.randomUUID(),
  );

  const sessionId = initResult.uploadSessionId;
  if (sessionId === undefined) {
    throw new Error('upload-init did not return a resumable session id');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let offset = 0;
  while (offset < bytes.length) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE_BYTES);
    await client.patch(`/assets/upload-sessions/${sessionId}`, {
      offsetBytes: offset,
      chunkBase64: bytesToBase64(chunk),
    });
    offset += chunk.length;
  }
  if (bytes.length === 0) {
    // Zero-byte file: no chunk loop ran, but the session still needs at
    // least one PATCH so the server's offset bookkeeping matches totalBytes.
    await client.patch(`/assets/upload-sessions/${sessionId}`, { offsetBytes: 0, chunkBase64: '' });
  }

  return client.post<AssetSummary>(`/assets/upload-sessions/${sessionId}/complete`, {});
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
