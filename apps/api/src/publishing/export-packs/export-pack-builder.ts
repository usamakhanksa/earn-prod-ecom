import sharp from 'sharp';
import { createTranslator, type Locale } from '@omnisell/i18n';
import type { ConnectorFieldSpec } from '@omnisell/shared';
import { buildZip, type ZipEntryInput } from './zip-writer';

/**
 * Export Pack builder (implentationplanphase.md task 4.12) — THE Tier C
 * deliverable's real generation logic. Deliberately separated from
 * `ExportPackGeneratorService` (which fetches bytes from `ObjectStorageService`
 * — unreachable in this sandbox, docs/DEBT.md) so this half — resize via
 * `sharp`, zip assembly, metadata.csv, field-cards.html, CHECKLIST.md — is
 * fully real and unit-testable with synthetic image buffers, no storage
 * dependency, same pattern Phase 2's `MockupComposeService` used.
 *
 * Tree shape matches api-registration.md §4 / README.md §4 exactly:
 *   print-files/, mockups/, metadata.csv, field-cards.html, CHECKLIST.md
 */

export interface ExportPackImageInput {
  placement: string;
  buffer: Buffer;
}

export interface ExportPackVariantInput {
  sku: string;
  size: string | null;
  color: string | null;
  priceMinor: bigint;
  currency: string;
}

export interface ExportPackMockupInput {
  placement: string;
  buffer: Buffer;
}

export interface ExportPackBuildInput {
  channelSlug: string;
  channelName: string;
  listingTitle: string;
  effectiveTitle: string;
  effectiveDescription: string;
  effectiveTags: string[];
  category: string | null;
  variants: ExportPackVariantInput[];
  images: ExportPackImageInput[];
  mockups: ExportPackMockupInput[];
  fieldSpec: ConnectorFieldSpec | null;
  locale: Locale;
}

export interface ExportPackBuildResult {
  zip: Buffer;
  fileName: string;
  items: Array<{ kind: 'PRINT_FILE' | 'MOCKUP' | 'METADATA_CSV' | 'FIELD_CARDS' | 'CHECKLIST'; fileName: string; sizeBytes: number }>;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildMetadataCsv(input: ExportPackBuildInput): string {
  const header = ['title', 'description', 'tags', 'category', 'variant_sku', 'variant_size', 'variant_color', 'price_minor', 'currency'];
  const rows: string[][] = [];
  const base = [input.effectiveTitle, input.effectiveDescription, input.effectiveTags.join('|'), input.category ?? ''];
  if (input.variants.length === 0) {
    rows.push([...base, '', '', '', '', '']);
  } else {
    for (const variant of input.variants) {
      rows.push([...base, variant.sku, variant.size ?? '', variant.color ?? '', variant.priceMinor.toString(), variant.currency]);
    }
  }
  const lines = [header.join(','), ...rows.map((row) => row.map(csvEscape).join(','))];
  return lines.join('\n') + '\n';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildFieldCardsHtml(input: ExportPackBuildInput, t: (key: string, params?: Record<string, string | number>) => string, dir: 'ltr' | 'rtl'): string {
  const field = (labelKey: string, value: string): string => `
    <section class="field-card">
      <h2>${escapeHtml(t(labelKey))}</h2>
      <textarea readonly onclick="this.select()">${escapeHtml(value)}</textarea>
    </section>`;

  return `<!doctype html>
<html lang="${input.locale}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.channelName)} — ${escapeHtml(t('exportPack.fieldCards.pageTitle'))}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #171B23; }
  .field-card { border: 1px solid #C9CFDA; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
  .field-card h2 { margin: 0 0 .5rem; font-size: 1rem; }
  textarea { width: 100%; min-height: 3rem; font: inherit; border: 1px solid #C9CFDA; border-radius: 6px; padding: .5rem; box-sizing: border-box; }
  .hint { color: #6B7484; font-size: .875rem; }
</style>
</head>
<body>
  <h1>${escapeHtml(input.channelName)} — ${escapeHtml(t('exportPack.fieldCards.pageTitle'))}</h1>
  <p class="hint">${escapeHtml(t('exportPack.fieldCards.copyHint'))}</p>
  ${field('exportPack.fieldCards.title', input.effectiveTitle)}
  ${field('exportPack.fieldCards.description', input.effectiveDescription)}
  ${field('exportPack.fieldCards.tags', input.effectiveTags.join(', '))}
  ${input.category !== null ? field('exportPack.fieldCards.category', input.category) : ''}
</body>
</html>
`;
}

export function buildChecklistMarkdown(input: ExportPackBuildInput, t: (key: string, params?: Record<string, string | number>) => string): string {
  const lines = [
    `# ${t('exportPack.checklist.title', { channelName: input.channelName })}`,
    '',
    t('exportPack.checklist.intro', { channelName: input.channelName, listingTitle: input.listingTitle }),
    '',
    t('exportPack.checklist.step1', { channelName: input.channelName }),
    t('exportPack.checklist.step2'),
    t('exportPack.checklist.step3'),
    t('exportPack.checklist.step4'),
    input.mockups.length > 0 ? t('exportPack.checklist.step5', { channelName: input.channelName }) : null,
    t('exportPack.checklist.step6', { channelName: input.channelName }),
  ].filter((line): line is string => line !== null);

  if (input.fieldSpec !== null && input.fieldSpec.maxTags > 0 && input.effectiveTags.length >= input.fieldSpec.maxTags) {
    lines.push('', t('exportPack.checklist.tagLimitNote', { channelName: input.channelName, maxTags: input.fieldSpec.maxTags }));
  }
  lines.push('', t('exportPack.checklist.generatedAt', { date: new Date().toISOString().slice(0, 10) }));
  return lines.join('\n') + '\n';
}

/** Resizes one source image to the connector's smallest confirmed spec (or a
 * safe default when none is declared) — real `sharp` work, same library
 * Phase 2's preflight/mockup pipeline already proved works in this sandbox. */
async function resizeForChannel(buffer: Buffer, fieldSpec: ConnectorFieldSpec | null): Promise<Buffer> {
  const spec = fieldSpec?.imageSpecs[0];
  const targetWidth = spec?.minWidthPx ?? 3000;
  const targetHeight = spec?.minHeightPx ?? 3000;
  return sharp(buffer)
    .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
}

/**
 * Dry-run preview (task 4.4) — the metadata.csv/CHECKLIST.md text an Export
 * Pack WOULD contain, without needing real image bytes (the preview doesn't
 * resize anything, so it works even before the source asset is fetchable).
 */
export function previewExportPackText(input: Omit<ExportPackBuildInput, 'images' | 'mockups'>): { metadataCsv: string; checklistMarkdown: string } {
  const { t } = createTranslator(input.locale);
  return {
    metadataCsv: buildMetadataCsv({ ...input, images: [], mockups: [] }),
    checklistMarkdown: buildChecklistMarkdown({ ...input, images: [], mockups: [] }, t),
  };
}

export async function buildExportPack(input: ExportPackBuildInput): Promise<ExportPackBuildResult> {
  const { t, dir } = createTranslator(input.locale);
  const entries: ZipEntryInput[] = [];
  const items: ExportPackBuildResult['items'] = [];

  for (const [index, image] of input.images.entries()) {
    const resized = await resizeForChannel(image.buffer, input.fieldSpec);
    const fileName = `print-files/${sanitizeFileNamePart(image.placement)}-${String(index + 1).padStart(2, '0')}.png`;
    entries.push({ name: fileName, data: resized });
    items.push({ kind: 'PRINT_FILE', fileName, sizeBytes: resized.length });
  }

  for (const [index, mockup] of input.mockups.entries()) {
    const fileName = `mockups/${sanitizeFileNamePart(mockup.placement)}-${String(index + 1).padStart(2, '0')}.png`;
    entries.push({ name: fileName, data: mockup.buffer });
    items.push({ kind: 'MOCKUP', fileName, sizeBytes: mockup.buffer.length });
  }

  const csv = Buffer.from(buildMetadataCsv(input), 'utf8');
  entries.push({ name: 'metadata.csv', data: csv });
  items.push({ kind: 'METADATA_CSV', fileName: 'metadata.csv', sizeBytes: csv.length });

  const fieldCards = Buffer.from(buildFieldCardsHtml(input, t, dir), 'utf8');
  entries.push({ name: 'field-cards.html', data: fieldCards });
  items.push({ kind: 'FIELD_CARDS', fileName: 'field-cards.html', sizeBytes: fieldCards.length });

  const checklist = Buffer.from(buildChecklistMarkdown(input, t), 'utf8');
  entries.push({ name: 'CHECKLIST.md', data: checklist });
  items.push({ kind: 'CHECKLIST', fileName: 'CHECKLIST.md', sizeBytes: checklist.length });

  const zip = buildZip(entries);
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `${input.channelSlug}-${datePart}-${sanitizeFileNamePart(input.listingTitle)}.zip`;
  return { zip, fileName, items };
}

function sanitizeFileNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}
