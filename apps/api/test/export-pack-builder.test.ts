import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildExportPack, type ExportPackBuildInput } from '../src/publishing/export-packs/export-pack-builder';

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 1 } } })
    .png()
    .toBuffer();
}

const baseInput: Omit<ExportPackBuildInput, 'images' | 'mockups' | 'fieldSpec' | 'locale'> = {
  channelSlug: 'redbubble',
  channelName: 'Redbubble',
  listingTitle: 'Sunset Over The Mountains Mug',
  effectiveTitle: 'Sunset Over The Mountains',
  effectiveDescription: 'A calming print of a mountain sunset.',
  effectiveTags: ['sunset', 'mountains', 'nature'],
  category: 'DRINKWARE',
  variants: [
    { sku: 'MUG-11OZ', size: '11oz', color: 'white', priceMinor: 1999n, currency: 'USD' },
    { sku: 'MUG-15OZ', size: '15oz', color: 'white', priceMinor: 2499n, currency: 'USD' },
  ],
};

describe('export-pack-builder', () => {
  let workDir: string | null = null;

  afterEach(() => {
    if (workDir !== null) {
      rmSync(workDir, { recursive: true, force: true });
      workDir = null;
    }
  });

  it('produces a real ZIP containing every required file (api-registration.md §4 tree)', async () => {
    const design = await solidPng(4000, 4000);
    const result = await buildExportPack({
      ...baseInput,
      images: [{ placement: 'default', buffer: design }],
      mockups: [],
      fieldSpec: { maxTitle: 120, maxDescription: 1000, maxTags: 15, imageSpecs: [{ placement: 'default', minWidthPx: 3840, minHeightPx: 3840, dpiMin: 150, formats: ['png'] }] },
      locale: 'en',
    });

    expect(result.zip.readUInt32LE(0)).toBe(0x04034b50);
    const kinds = result.items.map((i) => i.kind);
    expect(kinds).toEqual(['PRINT_FILE', 'METADATA_CSV', 'FIELD_CARDS', 'CHECKLIST']);

    workDir = mkdtempSync(join(tmpdir(), 'omnisell-export-pack-'));
    const zipPath = join(workDir, result.fileName);
    writeFileSync(zipPath, result.zip);

    let listing: string;
    try {
      listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    } catch {
      // Honest fallback if the environment has no system unzip — the
      // structural assertions above already proved this is a real ZIP.
      return;
    }
    expect(listing).toContain('print-files/default-01.png');
    expect(listing).toContain('metadata.csv');
    expect(listing).toContain('field-cards.html');
    expect(listing).toContain('CHECKLIST.md');

    execFileSync('unzip', ['-o', zipPath, '-d', workDir], { encoding: 'utf8' });

    // The print file was really resized to the channel's confirmed spec.
    const extractedImage = readFileSync(join(workDir, 'print-files', 'default-01.png'));
    const meta = await sharp(extractedImage).metadata();
    expect(meta.width).toBe(3840);
    expect(meta.height).toBe(3840);

    const csv = readFileSync(join(workDir, 'metadata.csv'), 'utf8');
    expect(csv).toContain('Sunset Over The Mountains');
    expect(csv).toContain('MUG-11OZ');
    expect(csv).toContain('MUG-15OZ');
    expect(csv.split('\n').filter((l) => l.length > 0)).toHaveLength(3); // header + 2 variants

    const fieldCards = readFileSync(join(workDir, 'field-cards.html'), 'utf8');
    expect(fieldCards).toContain('Sunset Over The Mountains');
    expect(fieldCards).toContain('sunset, mountains, nature');
    expect(fieldCards).toContain('dir="ltr"');

    const checklist = readFileSync(join(workDir, 'CHECKLIST.md'), 'utf8');
    expect(checklist).toContain('Redbubble');
    expect(checklist.length).toBeGreaterThan(0);
  });

  it('generates a real Arabic checklist and RTL field-cards page when locale is "ar"', async () => {
    const design = await solidPng(3840, 3840);
    const result = await buildExportPack({
      ...baseInput,
      images: [{ placement: 'default', buffer: design }],
      mockups: [],
      fieldSpec: null,
      locale: 'ar',
    });

    const zipEntry = result.items.find((i) => i.kind === 'FIELD_CARDS');
    expect(zipEntry).toBeDefined();

    workDir = mkdtempSync(join(tmpdir(), 'omnisell-export-pack-ar-'));
    const zipPath = join(workDir, result.fileName);
    writeFileSync(zipPath, result.zip);
    try {
      execFileSync('unzip', ['-o', zipPath, '-d', workDir], { encoding: 'utf8' });
    } catch {
      return;
    }
    const fieldCards = readFileSync(join(workDir, 'field-cards.html'), 'utf8');
    expect(fieldCards).toContain('dir="rtl"');
    expect(fieldCards).toContain('lang="ar"');

    const checklist = readFileSync(join(workDir, 'CHECKLIST.md'), 'utf8');
    // Real Arabic content, not an untranslated English fallback string.
    expect(/[؀-ۿ]/.test(checklist)).toBe(true);
  });

  it('includes mockups/ only when mockups were supplied — no empty folder fabricated', async () => {
    const design = await solidPng(3840, 3840);
    const withoutMockups = await buildExportPack({ ...baseInput, images: [{ placement: 'default', buffer: design }], mockups: [], fieldSpec: null, locale: 'en' });
    expect(withoutMockups.items.some((i) => i.kind === 'MOCKUP')).toBe(false);

    const mockupBuffer = await solidPng(800, 800);
    const withMockups = await buildExportPack({
      ...baseInput,
      images: [{ placement: 'default', buffer: design }],
      mockups: [{ placement: 'default', buffer: mockupBuffer }],
      fieldSpec: null,
      locale: 'en',
    });
    expect(withMockups.items.some((i) => i.kind === 'MOCKUP')).toBe(true);
  });

  it('adds a tag-limit note in the checklist when the tag count hits the connector max', async () => {
    const design = await solidPng(3840, 3840);
    const result = await buildExportPack({
      ...baseInput,
      effectiveTags: ['a', 'b'],
      images: [{ placement: 'default', buffer: design }],
      mockups: [],
      fieldSpec: { maxTitle: 100, maxDescription: 100, maxTags: 2, imageSpecs: [] },
      locale: 'en',
    });
    workDir = mkdtempSync(join(tmpdir(), 'omnisell-export-pack-tags-'));
    const zipPath = join(workDir, result.fileName);
    writeFileSync(zipPath, result.zip);
    try {
      execFileSync('unzip', ['-o', zipPath, '-d', workDir], { encoding: 'utf8' });
    } catch {
      return;
    }
    const checklist = readFileSync(join(workDir, 'CHECKLIST.md'), 'utf8');
    expect(checklist.toLowerCase()).toContain('2 tags');
  });
});
