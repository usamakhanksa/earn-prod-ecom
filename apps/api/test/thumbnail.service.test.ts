import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ThumbnailService } from '../src/common/storage/thumbnail.service';

/**
 * Exercises the real sharp pipeline against synthetic image bytes sharp
 * itself generates — proving the pipeline genuinely runs in this sandbox
 * (docs/DEBT.md notes this is NOT the same as a real user-upload round trip,
 * which needs a browser + live MinIO neither available here).
 */
async function makePng(width: number, height: number, withAlpha: boolean): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: withAlpha ? 4 : 3,
      background: withAlpha ? { r: 10, g: 20, b: 30, alpha: 0.5 } : { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

describe('ThumbnailService.extractMetadata', () => {
  const service = new ThumbnailService();

  it('reads real width/height from PNG bytes it generated itself', async () => {
    const buffer = await makePng(800, 600, false);
    const meta = await service.extractMetadata(buffer);
    expect(meta.widthPx).toBe(800);
    expect(meta.heightPx).toBe(600);
  });

  it('detects alpha transparency', async () => {
    const withAlpha = await service.extractMetadata(await makePng(100, 100, true));
    const withoutAlpha = await service.extractMetadata(await makePng(100, 100, false));
    expect(withAlpha.hasTransparency).toBe(true);
    expect(withoutAlpha.hasTransparency).toBe(false);
  });

  it('maps sRGB output to the RGB color profile', async () => {
    const meta = await service.extractMetadata(await makePng(50, 50, false));
    expect(meta.colorProfile).toBe('RGB');
  });

  it('degrades to UNKNOWN/null fields for bytes sharp cannot parse at all, rather than throwing', async () => {
    const garbage = Buffer.from('this is not an image', 'utf8');
    const meta = await service.extractMetadata(garbage);
    expect(meta.colorProfile).toBe('UNKNOWN');
    expect(meta.widthPx).toBeNull();
    expect(meta.heightPx).toBeNull();
  });
});

describe('ThumbnailService.generateThumbnailAndPreview', () => {
  const service = new ThumbnailService();

  it('produces a thumbnail and preview both smaller than or equal to their caps', async () => {
    const source = await makePng(4000, 3000, false);
    const { thumbnail, preview } = await service.generateThumbnailAndPreview(source);

    const thumbMeta = await sharp(thumbnail).metadata();
    const previewMeta = await sharp(preview).metadata();

    expect(thumbMeta.width).toBeLessThanOrEqual(320);
    expect(thumbMeta.height).toBeLessThanOrEqual(320);
    expect(previewMeta.width).toBeLessThanOrEqual(1600);
    expect(previewMeta.height).toBeLessThanOrEqual(1600);
    // Preview stays materially larger than the thumbnail for the same source.
    expect(previewMeta.width ?? 0).toBeGreaterThan(thumbMeta.width ?? 0);
  });

  it('never enlarges an image smaller than the target caps', async () => {
    const source = await makePng(100, 80, false);
    const { thumbnail } = await service.generateThumbnailAndPreview(source);
    const meta = await sharp(thumbnail).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(80);
  });
});
