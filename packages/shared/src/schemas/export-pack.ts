import { z } from 'zod';
import { EXPORT_PACK_ITEM_KINDS, EXPORT_PACK_STATUSES } from '../enums';

/**
 * Export Pack generator (4.12) — the Tier C deliverable. api-registration.md
 * §4 / README.md §4's exact tree: `print-files/`, `mockups/`, `metadata.csv`,
 * `field-cards.html`, `CHECKLIST.md`.
 */

export const generateExportPackSchema = z.object({
  listingId: z.string().min(1),
  locale: z.enum(['en', 'ar']).default('en'),
});
export type GenerateExportPackInput = z.infer<typeof generateExportPackSchema>;

export const confirmExportPackSchema = z.object({
  note: z.string().max(2000).optional(),
});
export type ConfirmExportPackInput = z.infer<typeof confirmExportPackSchema>;

export interface ExportPackItemView {
  id: string;
  kind: (typeof EXPORT_PACK_ITEM_KINDS)[number];
  fileName: string;
  sizeBytes: number;
}

export interface ExportPackView {
  id: string;
  listingId: string;
  connectionId: string;
  connectorSlug: string;
  status: (typeof EXPORT_PACK_STATUSES)[number];
  locale: string;
  fileName: string;
  sizeBytes: number;
  items: ExportPackItemView[];
  confirmedByUserId: string | null;
  confirmedByUserAt: string | null;
  createdAt: string;
}
