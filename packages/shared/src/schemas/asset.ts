import { z } from 'zod';
import { ASSET_COLOR_LABELS, ASSET_KINDS, UPLOAD_MODES } from '../enums';

/** Drag-drop multi-upload ceiling (featureslist.md 2.1 — "up to 200 MB"). */
export const MAX_ASSET_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export const ACCEPTED_ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/tiff',
  'application/pdf',
  'application/postscript', // .ai
  'image/vnd.adobe.photoshop', // .psd
] as const;

export const initUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_FILE_SIZE_BYTES),
  mode: z.enum(UPLOAD_MODES).default('PRESIGNED'),
  folderId: z.string().min(1).optional(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

/**
 * Chunk upload body (featureslist.md 2.2). Scoped down from the real tus wire
 * protocol (which PATCHes raw `application/offset+octet-stream` bytes) to a
 * JSON envelope with a base64 chunk — this keeps the endpoint usable through
 * Nest's default JSON body parser without extra raw-body middleware wiring,
 * while still modelling tus's real offset-tracking semantics (a mismatched
 * `offsetBytes` is rejected, matching a real tus server). Recorded as a
 * deliberate scope reduction in docs/DEBT.md, not silently substituted.
 */
export const uploadChunkSchema = z.object({
  offsetBytes: z.number().int().min(0),
  // A zero-length chunk is valid (a zero-byte file's only "chunk"); the
  // server enforces the real progress invariant via the offset check, not a
  // minimum chunk size.
  chunkBase64: z.string(),
});
export type UploadChunkInput = z.infer<typeof uploadChunkSchema>;

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().min(1).nullable().optional(),
  starred: z.boolean().optional(),
  colorLabel: z.enum(ASSET_COLOR_LABELS).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).optional(),
});
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

export const listAssetsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).default(30).transform((value) => Math.min(value, 100)),
  folderId: z.string().min(1).optional(),
  collectionId: z.string().min(1).optional(),
  starred: z.coerce.boolean().optional(),
  colorLabel: z.enum(ASSET_COLOR_LABELS).optional(),
  tag: z.string().min(1).optional(),
  search: z.string().min(1).max(200).optional(),
  kind: z.enum(ASSET_KINDS).optional(),
});
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

export const completePresignedUploadSchema = z.object({
  clientMetadata: z
    .object({
      widthPx: z.number().int().positive().optional(),
      heightPx: z.number().int().positive().optional(),
    })
    .optional(),
});
export type CompletePresignedUploadInput = z.infer<typeof completePresignedUploadSchema>;

export const rollbackAssetSchema = z.object({
  versionNumber: z.number().int().positive(),
});
export type RollbackAssetInput = z.infer<typeof rollbackAssetSchema>;

export const createFolderSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().min(1).nullable().optional(),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const addAssetToCollectionSchema = z.object({
  assetId: z.string().min(1),
});
export type AddAssetToCollectionInput = z.infer<typeof addAssetToCollectionSchema>;

export interface AssetSummary {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  previewKey: string | null;
  thumbnailKey: string | null;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  colorProfile: string | null;
  hasTransparency: boolean | null;
  status: string;
  starred: boolean;
  colorLabel: string | null;
  tags: string[];
  currentVersion: number;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  latestPreflightStatus: string | null;
}

export interface AssetVersionSummary {
  id: string;
  versionNumber: number;
  storageKey: string;
  previewKey: string | null;
  sizeBytes: number;
  mimeType: string;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  note: string | null;
  createdAt: string;
}

export interface FolderSummary {
  id: string;
  name: string;
  parentId: string | null;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  assetCount: number;
  createdAt: string;
}

export interface UploadInitResult {
  assetId: string;
  mode: 'PRESIGNED' | 'RESUMABLE';
  storageKey: string;
  expiresAt: string;
  /** Present when mode === 'PRESIGNED': PUT the raw file bytes here. */
  presignedUrl?: string;
  presignedMethod?: 'PUT';
  /** Present when mode === 'RESUMABLE': tus-like session to PATCH chunks against. */
  uploadSessionId?: string;
  receivedBytes?: number;
  totalBytes?: number;
}
