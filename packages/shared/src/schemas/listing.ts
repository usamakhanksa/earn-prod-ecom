import { z } from 'zod';
import { BULK_ACTION_TYPES, LISTING_APPROVAL_STATUSES, LISTING_STATUSES } from '../enums';
import { currencyCodeSchema } from '../money';

/**
 * Publishing Pipeline (Phase 4 / implentationplanphase.md tasks 4.1-4.11).
 * One shared composer shape drives create/dry-run/publish/bulk so the web
 * composer, the dry-run preview, and the real publish call can never drift
 * from one another (featureslist.md 5.5's trust requirement starts here).
 */

const minorStringSchema = z.string().regex(/^\d+$/, 'Minor-unit integer required');

export const listingFieldOverrideSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20_000).optional(),
  tags: z.array(z.string().min(1).max(60)).max(100).optional(),
  category: z.string().max(200).optional(),
});
export type ListingFieldOverrideInput = z.infer<typeof listingFieldOverrideSchema>;

export const listingVariantSelectionSchema = z.object({
  productVariantId: z.string().min(1),
  priceMinor: minorStringSchema.optional(), // falls back to the variant's channel/default VariantPrice when omitted
  currency: currencyCodeSchema.optional(),
});
export type ListingVariantSelectionInput = z.infer<typeof listingVariantSelectionSchema>;

/** The composer's core payload — one row per selected channel is what
 * actually gets created (`Listing` is per-(product,connection), prompt.md's
 * data model tree). */
export const listingComposerSchema = z.object({
  productId: z.string().min(1),
  connectionIds: z.array(z.string().min(1)).min(1).max(50),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).default(''),
  tags: z.array(z.string().min(1).max(60)).max(100).default([]),
  category: z.string().max(200).optional(),
  variants: z.array(listingVariantSelectionSchema).min(1),
  /** Per-connectionId field overrides — only the fields that diverge from
   * the canonical title/description/tags/category above. */
  overrides: z.record(z.string(), listingFieldOverrideSchema).default({}),
  scheduledAt: z.string().datetime().optional(), // ISO-8601 UTC — stored as-is, resolved to tenant tz for display (4.9)
  scheduledTimezone: z.string().min(1).max(64).optional(), // IANA tz, e.g. "Asia/Riyadh"
});
export type ListingComposerInput = z.infer<typeof listingComposerSchema>;

export const dryRunListingSchema = listingComposerSchema;
export type DryRunListingInput = ListingComposerInput;

export const publishListingSchema = listingComposerSchema;
export type PublishListingInput = ListingComposerInput;

export const updateListingSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20_000).optional(),
  tags: z.array(z.string().min(1).max(60)).max(100).optional(),
  category: z.string().max(200).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  scheduledTimezone: z.string().min(1).max(64).optional(),
});
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const listListingsQuerySchema = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
  /** The web sidebar's "Rejected" view covers both REJECTED and ERROR
   * listings in one screen (task description: "Rejected-Errors list
   * views"); "Scheduled" is DRAFT listings with a `scheduledAt` set — neither
   * is a real `LISTING_STATUSES` value on its own, hence a dedicated
   * sentinel rather than overloading `status`. */
  view: z.enum(['REJECTED_OR_ERROR', 'SCHEDULED']).optional(),
  productId: z.string().optional(),
  connectionId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;

export const submitForApprovalSchema = z.object({
  comment: z.string().max(2000).optional(),
});
export type SubmitForApprovalInput = z.infer<typeof submitForApprovalSchema>;

export const decideApprovalSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().max(2000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const addListingCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});
export type AddListingCommentInput = z.infer<typeof addListingCommentSchema>;

/** Bulk actions (4.8). `patch` shape depends on `action` — validated further
 * in the service since it varies per action (reprice needs a price, retag
 * needs tags, publish/unpublish/resync/delete need nothing extra). */
export const bulkListingActionSchema = z.object({
  action: z.enum(BULK_ACTION_TYPES),
  listingIds: z.array(z.string().min(1)).min(1).max(500),
  reprice: z
    .object({
      priceMinor: minorStringSchema,
      currency: currencyCodeSchema,
    })
    .optional(),
  retag: z
    .object({
      tags: z.array(z.string().min(1).max(60)).max(100),
      mode: z.enum(['REPLACE', 'APPEND']).default('REPLACE'),
    })
    .optional(),
});
export type BulkListingActionInput = z.infer<typeof bulkListingActionSchema>;

export const undoBulkRepriceSchema = z.object({
  entries: z.array(z.object({ listingVariantId: z.string().min(1), priceMinor: minorStringSchema, currency: currencyCodeSchema })).min(1),
});
export type UndoBulkRepriceInput = z.infer<typeof undoBulkRepriceSchema>;

// --- Response / view shapes ---

export interface ListingFieldOverrideView {
  fieldKey: string;
  value: unknown;
}

export interface ListingVariantView {
  id: string;
  productVariantId: string;
  sku: string;
  size: string | null;
  color: string | null;
  externalId: string | null;
  priceMinor: string;
  currency: string;
  status: string;
}

export interface ListingEventView {
  id: string;
  type: string;
  message: string;
  payload: unknown;
  actorId: string | null;
  createdAt: string;
}

export interface ListingSummary {
  id: string;
  productId: string;
  productName: string;
  connectionId: string;
  connectorSlug: string;
  connectionLabel: string;
  title: string;
  status: (typeof LISTING_STATUSES)[number];
  approvalStatus: (typeof LISTING_APPROVAL_STATUSES)[number];
  isExportPackChannel: boolean;
  scheduledAt: string | null;
  scheduledTimezone: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingDetail extends ListingSummary {
  description: string;
  tags: string[];
  category: string | null;
  variants: ListingVariantView[];
  overrides: ListingFieldOverrideView[];
  events: ListingEventView[];
  exportPackId: string | null;
}

/** Dry-run result (4.4) — one entry per requested channel, rendering the
 * EXACT adapter payload (Tier A/B) or the Export Pack preview (Tier C). */
export interface DryRunChannelResult {
  connectionId: string;
  connectorSlug: string;
  tier: string;
  isExportPackChannel: boolean;
  effectiveTitle: string;
  effectiveDescription: string;
  effectiveTags: string[];
  fieldSpec: unknown;
  counters: { titleLength: number; titleMax: number | null; descriptionLength: number; descriptionMax: number | null; tagCount: number; tagMax: number | null };
  warnings: string[];
  /** Tier A/B: the exact adapter.buildPublishPayload() output. Tier C /
   * unsupported adapters: null (see `exportPackPreview` instead). */
  payloadPreview: unknown;
  exportPackPreview: { metadataCsv: string; checklistMarkdown: string; fileCount: number } | null;
  policyViolations: PolicyViolation[];
}

export interface DryRunResult {
  channels: DryRunChannelResult[];
  blocked: boolean;
}

export interface PolicyViolation {
  field: 'title' | 'description' | 'tags';
  term: string;
  category: string;
  matchType: string;
  matchedText: string;
}

export interface SyncJobItemView {
  id: string;
  listingId: string;
  connectionId: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJobView {
  id: string;
  kind: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  items: SyncJobItemView[];
  createdAt: string;
  completedAt: string | null;
}

export interface BulkActionResultItem {
  listingId: string;
  ok: boolean;
  error: string | null;
  undo?: { listingVariantId: string; priceMinor: string; currency: string };
}

export interface BulkActionResult {
  syncJobId: string | null;
  results: BulkActionResultItem[];
  reversible: boolean;
}

export interface DriftFieldDiff {
  field: 'title' | 'description' | 'tags' | 'priceMinor' | 'status';
  local: unknown;
  remote: unknown;
}

export interface DriftCheckResult {
  supported: boolean;
  hasDrift: boolean;
  diffs: DriftFieldDiff[];
  checkedAt: string;
}
