import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { AssetColorProfile } from '@omnisell/shared';

export interface ImageMetadataResult {
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  hasTransparency: boolean | null;
  colorProfile: AssetColorProfile;
}

export interface ThumbnailResult {
  thumbnail: Buffer;
  preview: Buffer;
}

const THUMBNAIL_MAX_PX = 320;
const PREVIEW_MAX_PX = 1600;

/**
 * Real sharp-based thumbnail/preview/metadata pipeline (featureslist.md 2.1,
 * implentationplanphase.md task 2.1). Verified in this sandbox against
 * synthetic image bytes sharp itself generates
 * (apps/api/test/thumbnail.service.test.ts) — proving the pipeline code
 * genuinely runs here, NOT that it has been exercised against a real user
 * upload end-to-end (no browser/MinIO round trip is possible in this
 * sandbox, docs/DEBT.md). Vector/PDF/PSD formats commonly fail metadata
 * extraction under sharp/libvips without extra system libraries — that
 * degrades to `UNKNOWN`/`null` rather than throwing, which is the honest
 * behaviour for a format this pipeline cannot introspect.
 */
@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);

  async extractMetadata(buffer: Buffer): Promise<ImageMetadataResult> {
    try {
      const meta = await sharp(buffer).metadata();
      return {
        widthPx: meta.width ?? null,
        heightPx: meta.height ?? null,
        dpi: meta.density ?? null,
        hasTransparency: meta.hasAlpha ?? null,
        colorProfile: mapColorProfile(meta.space),
      };
    } catch (error) {
      this.logger.warn(`Could not extract image metadata (unsupported format for this pipeline): ${String(error)}`);
      return { widthPx: null, heightPx: null, dpi: null, hasTransparency: null, colorProfile: 'UNKNOWN' };
    }
  }

  async generateThumbnailAndPreview(buffer: Buffer): Promise<ThumbnailResult> {
    const source = sharp(buffer);
    const [thumbnail, preview] = await Promise.all([
      source.clone().resize(THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX, { fit: 'inside', withoutEnlargement: true }).png().toBuffer(),
      source.clone().resize(PREVIEW_MAX_PX, PREVIEW_MAX_PX, { fit: 'inside', withoutEnlargement: true }).png().toBuffer(),
    ]);
    return { thumbnail, preview };
  }
}

function mapColorProfile(space: string | undefined): AssetColorProfile {
  if (space === 'cmyk') {
    return 'CMYK';
  }
  if (space === 'srgb' || space === 'rgb' || space === 'rgb16' || space === 'b-w') {
    return 'RGB';
  }
  return 'UNKNOWN';
}
