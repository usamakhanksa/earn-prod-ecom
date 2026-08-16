import { z } from 'zod';
import { ASSET_COLOR_PROFILES, PREFLIGHT_OVERALL_STATUSES, PREFLIGHT_RULES, PREFLIGHT_RULE_STATUSES } from '../enums';

/**
 * Print-file preflight engine contracts (featureslist.md 2.7,
 * implentationplanphase.md task 2.4). The engine itself
 * (apps/api/src/studio/preflight/preflight.engine.ts) is pure and needs no
 * infra — these are the shared input/output shapes so the web UI renders the
 * exact same rule set the API computed, never a re-derived guess.
 */

export const printAreaSpecSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  dpiMin: z.number().int().positive(),
  dpiRecommended: z.number().int().positive(),
  bleedIn: z.number().min(0),
  safeAreaIn: z.number().min(0),
  allowsTransparency: z.boolean(),
  colorProfile: z.enum(ASSET_COLOR_PROFILES),
  maxFileSizeMb: z.number().positive(),
});
export type PrintAreaSpec = z.infer<typeof printAreaSpecSchema>;

export const preflightAssetInputSchema = z.object({
  widthPx: z.number().int().positive().nullable(),
  heightPx: z.number().int().positive().nullable(),
  dpi: z.number().int().positive().nullable(),
  colorProfile: z.enum(ASSET_COLOR_PROFILES).nullable(),
  hasTransparency: z.boolean().nullable(),
  minStrokeWidthPx: z.number().positive().nullable(),
  sizeBytes: z.number().int().nonnegative(),
});
export type PreflightAssetInput = z.infer<typeof preflightAssetInputSchema>;

export const runPreflightSchema = z.object({
  blueprintId: z.string().min(1).optional(),
  placementCode: z.string().min(1).optional(),
});
export type RunPreflightInput = z.infer<typeof runPreflightSchema>;

export interface PreflightRuleResult {
  rule: (typeof PREFLIGHT_RULES)[number];
  status: (typeof PREFLIGHT_RULE_STATUSES)[number];
  /** i18n key under `studio.preflight.rule.*` — params interpolated client-side. */
  messageKey: string;
  params?: Record<string, string | number>;
}

export interface PreflightReportResult {
  overallStatus: (typeof PREFLIGHT_OVERALL_STATUSES)[number];
  rules: PreflightRuleResult[];
}

export interface PreflightReportSummary extends PreflightReportResult {
  id: string;
  assetId: string;
  blueprintId: string | null;
  placementCode: string | null;
  createdAt: string;
}

/** File-size ceiling shared with the upload endpoint (2.1) — preflight FAILs
 * anything that slipped past upload-time validation some other way. */
export const PREFLIGHT_MAX_FILE_SIZE_MB_DEFAULT = 200;
