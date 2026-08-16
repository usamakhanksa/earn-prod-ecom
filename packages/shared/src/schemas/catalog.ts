import { z } from 'zod';
import { PLACEMENT_CODES, PRODUCT_STATUSES } from '../enums';
import { currencyCodeSchema } from '../money';

/**
 * Product master + variant matrix + design placements (featureslist.md
 * 3.1/3.3/3.4/3.5, implentationplanphase.md tasks 2.7/2.8/2.12).
 */

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sku: z.string().min(1).max(64),
  blueprintId: z.string().min(1).optional(),
  primaryAssetId: z.string().min(1).optional(),
  priceMinor: z.string().regex(/^\d+$/).optional(),
  currency: currencyCodeSchema.optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  primaryAssetId: z.string().min(1).nullable().optional(),
  priceMinor: z.string().regex(/^\d+$/).optional(),
  currency: currencyCodeSchema.optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Variant matrix builder (3.3) — generate one ProductVariant per selected
 * size x colour combination from the product's Blueprint. Re-running with an
 * overlapping selection is idempotent: existing (size,color) pairs are left
 * alone, only the new combinations are created. */
export const generateVariantMatrixSchema = z.object({
  sizes: z.array(z.string().min(1)).min(1),
  colors: z.array(z.string().min(1)).min(1),
});
export type GenerateVariantMatrixInput = z.infer<typeof generateVariantMatrixSchema>;

export const bulkToggleVariantsSchema = z.object({
  variantIds: z.array(z.string().min(1)).min(1),
  isEnabled: z.boolean(),
});
export type BulkToggleVariantsInput = z.infer<typeof bulkToggleVariantsSchema>;

export const updateVariantSchema = z.object({
  isEnabled: z.boolean().optional(),
  baseCostMinor: z.string().regex(/^\d+$/).optional(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const duplicateProductSchema = z.object({
  newSku: z.string().min(1).max(64),
  newName: z.string().min(1).max(200).optional(),
  includeVariants: z.boolean().default(true),
  includePlacements: z.boolean().default(true),
});
export type DuplicateProductInput = z.infer<typeof duplicateProductSchema>;

export const listProductsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).default(30).transform((value) => Math.min(value, 100)),
  status: z.enum(PRODUCT_STATUSES).optional(),
  search: z.string().min(1).max(200).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// --- Design placement mapping (3.4/3.5) --------------------------------------

export const upsertPlacementSchema = z.object({
  placementCode: z.enum(PLACEMENT_CODES),
  assetId: z.string().min(1),
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  scalePct: z.number().positive().max(500).default(100),
  rotationDeg: z.number().min(-180).max(180).default(0),
});
export type UpsertPlacementInput = z.infer<typeof upsertPlacementSchema>;

export const savePlacementTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  blueprintId: z.string().min(1).optional(),
});
export type SavePlacementTemplateInput = z.infer<typeof savePlacementTemplateSchema>;

export const applyPlacementTemplateSchema = z.object({
  templateId: z.string().min(1),
  /** Which asset to map onto every placement the template defines — the
   * template stores geometry only, not a specific design. */
  assetId: z.string().min(1),
});
export type ApplyPlacementTemplateInput = z.infer<typeof applyPlacementTemplateSchema>;

export interface PlacementItem {
  placementCode: string;
  xPct: number;
  yPct: number;
  scalePct: number;
  rotationDeg: number;
}

export interface PlacementSummary extends PlacementItem {
  id: string;
  productId: string;
  assetId: string;
  templateId: string | null;
}

export interface PlacementTemplateSummary {
  id: string;
  name: string;
  blueprintId: string | null;
  items: PlacementItem[];
  createdAt: string;
}

// --- Read models --------------------------------------------------------------

export interface ProductVariantSummary {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  isEnabled: boolean;
  baseCostMinor: string;
  currency: string;
  prices: Array<{ channel: string; currency: string; priceMinor: string; compareAtMinor: string | null; marginPct: number | null }>;
}

export interface ProductSummary {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  status: string;
  blueprintId: string | null;
  primaryAssetId: string | null;
  priceMinor: string;
  currency: string;
  variantCount: number;
  enabledVariantCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProductDetail extends ProductSummary {
  variants: ProductVariantSummary[];
  placements: PlacementSummary[];
}

/** One flattened row of the CSV import/export shape (3.10). */
export interface ProductCsvRow {
  productSku: string;
  productName: string;
  status: string;
  variantSku: string;
  size: string;
  color: string;
  isEnabled: string;
  baseCostMinor: string;
  priceMinor: string;
  currency: string;
}

export const CSV_HEADER: readonly (keyof ProductCsvRow)[] = [
  'productSku',
  'productName',
  'status',
  'variantSku',
  'size',
  'color',
  'isEnabled',
  'baseCostMinor',
  'priceMinor',
  'currency',
];
