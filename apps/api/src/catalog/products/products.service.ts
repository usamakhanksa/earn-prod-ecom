import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BulkToggleVariantsInput,
  CreateProductInput,
  DuplicateProductInput,
  GenerateVariantMatrixInput,
  ListProductsQuery,
  ProductCsvRow,
  ProductDetail,
  ProductSummary,
  ProductVariantSummary,
  UpdateProductInput,
} from '@omnisell/shared';
import { ProductRepository } from '../../repositories/product.repository';
import { ProductVariantRepository } from '../../repositories/product-variant.repository';
import { BlueprintRepository } from '../../repositories/blueprint.repository';
import { DesignPlacementRepository } from '../../repositories/design-placement.repository';
import { ListingRepository } from '../../repositories/listing.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { csvToProductRows, productsToCsv } from './csv.util';

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductRepository,
    private readonly variants: ProductVariantRepository,
    private readonly blueprints: BlueprintRepository,
    private readonly placements: DesignPlacementRepository,
    private readonly listings: ListingRepository,
    private readonly audit: AuditLogService,
  ) {}

  async create(tenantId: string, userId: string, input: CreateProductInput): Promise<ProductDetail> {
    const existing = await this.products.findBySku(tenantId, input.sku);
    if (existing !== null) {
      throw new ConflictException(`SKU '${input.sku}' already exists for this tenant`);
    }
    const product = await this.products.create({
      tenantId,
      name: input.name,
      description: input.description ?? null,
      sku: input.sku,
      blueprintId: input.blueprintId ?? null,
      primaryAssetId: input.primaryAssetId ?? null,
      priceMinor: input.priceMinor !== undefined ? BigInt(input.priceMinor) : 0n,
      currency: input.currency ?? 'USD',
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'product.created', entityType: 'Product', entityId: product.id, after: product });
    return this.getDetail(tenantId, product.id);
  }

  async update(tenantId: string, userId: string, id: string, input: UpdateProductInput): Promise<ProductDetail> {
    const before = await this.products.findById(tenantId, id);
    if (before === null) {
      throw new NotFoundException('Product not found');
    }
    const updated = await this.products.update(tenantId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status, isActive: input.status !== 'ARCHIVED' } : {}),
      ...(input.primaryAssetId !== undefined ? { primaryAssetId: input.primaryAssetId } : {}),
      ...(input.priceMinor !== undefined ? { priceMinor: BigInt(input.priceMinor) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
    });
    if (updated === null) {
      throw new NotFoundException('Product not found');
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'product.updated', entityType: 'Product', entityId: id, before, after: updated });
    return this.getDetail(tenantId, id);
  }

  async list(tenantId: string, query: ListProductsQuery): Promise<{ items: ProductSummary[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.products.list(tenantId, query);
    return { items: items.map(toProductSummary), nextCursor };
  }

  async getDetail(tenantId: string, id: string): Promise<ProductDetail> {
    const product = await this.products.findById(tenantId, id);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    const [variants, placements] = await Promise.all([
      this.variants.listForProduct(tenantId, id),
      this.placements.listForProduct(tenantId, id),
    ]);
    return {
      ...toProductSummary({ ...product, variantCount: variants.length, enabledVariantCount: variants.filter((v) => v.isEnabled).length }),
      variants: variants.map(toVariantSummary),
      placements: placements.map((p) => ({
        id: p.id,
        productId: p.productId,
        assetId: p.assetId,
        templateId: p.templateId,
        placementCode: p.placementCode,
        xPct: p.xPct,
        yPct: p.yPct,
        scalePct: p.scalePct,
        rotationDeg: p.rotationDeg,
      })),
    };
  }

  /** Variant matrix builder (3.3) — idempotent: existing (size,color)
   * combinations are left untouched, only new ones are created. Cost is
   * pulled from the matching BlueprintVariant when the product has a
   * blueprint, else defaults to zero (user sets it later). */
  async generateVariantMatrix(
    tenantId: string,
    userId: string,
    productId: string,
    input: GenerateVariantMatrixInput,
  ): Promise<ProductVariantSummary[]> {
    const product = await this.products.findById(tenantId, productId);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    const blueprint = product.blueprintId !== null ? await this.blueprints.findById(tenantId, product.blueprintId) : null;
    const existingCombos = await this.variants.findExistingCombos(tenantId, productId);

    const rows: Array<{
      tenantId: string;
      productId: string;
      blueprintVariantId: string | null;
      sku: string;
      size: string;
      color: string;
      baseCostMinor: bigint;
      currency: string;
    }> = [];

    for (const size of input.sizes) {
      for (const color of input.colors) {
        const key = `${size}::${color}`;
        if (existingCombos.has(key)) {
          continue;
        }
        const match = blueprint?.variants.find((v) => v.size === size && v.color === color) ?? null;
        rows.push({
          tenantId,
          productId,
          blueprintVariantId: match?.id ?? null,
          sku: buildVariantSku(product.sku, size, color),
          size,
          color,
          baseCostMinor: match?.baseCostMinor ?? 0n,
          currency: match?.currency ?? product.currency,
        });
      }
    }

    await this.variants.createMany(rows);
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'product.variant_matrix_generated',
      entityType: 'Product',
      entityId: productId,
      after: { createdCount: rows.length, sizes: input.sizes, colors: input.colors },
    });

    const all = await this.variants.listForProduct(tenantId, productId);
    return all.map(toVariantSummary);
  }

  async bulkToggleVariants(tenantId: string, userId: string, productId: string, input: BulkToggleVariantsInput): Promise<{ updated: number }> {
    const product = await this.products.findById(tenantId, productId);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    const updated = await this.variants.bulkSetEnabled(tenantId, input.variantIds, input.isEnabled);
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'product.variants_bulk_toggled',
      entityType: 'Product',
      entityId: productId,
      after: { variantIds: input.variantIds, isEnabled: input.isEnabled, updated },
    });
    return { updated };
  }

  async duplicate(tenantId: string, userId: string, productId: string, input: DuplicateProductInput): Promise<ProductDetail> {
    const source = await this.products.findById(tenantId, productId);
    if (source === null) {
      throw new NotFoundException('Product not found');
    }
    const existing = await this.products.findBySku(tenantId, input.newSku);
    if (existing !== null) {
      throw new ConflictException(`SKU '${input.newSku}' already exists for this tenant`);
    }

    const created = await this.products.create({
      tenantId,
      name: input.newName ?? `${source.name} (copy)`,
      description: source.description,
      sku: input.newSku,
      status: 'DRAFT',
      blueprintId: source.blueprintId,
      primaryAssetId: source.primaryAssetId,
      priceMinor: source.priceMinor,
      currency: source.currency,
    });

    if (input.includeVariants) {
      const sourceVariants = await this.variants.listForProduct(tenantId, productId);
      await this.variants.createMany(
        sourceVariants.map((v) => ({
          tenantId,
          productId: created.id,
          blueprintVariantId: v.blueprintVariantId,
          sku: buildVariantSku(input.newSku, v.size ?? '', v.color ?? ''),
          size: v.size,
          color: v.color,
          baseCostMinor: v.baseCostMinor,
          currency: v.currency,
        })),
      );
    }

    if (input.includePlacements) {
      const sourcePlacements = await this.placements.listForProduct(tenantId, productId);
      for (const placement of sourcePlacements) {
        await this.placements.upsert({
          tenantId,
          productId: created.id,
          placementCode: placement.placementCode,
          assetId: placement.assetId,
          xPct: placement.xPct,
          yPct: placement.yPct,
          scalePct: placement.scalePct,
          rotationDeg: placement.rotationDeg,
        });
      }
    }

    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'product.duplicated',
      entityType: 'Product',
      entityId: created.id,
      after: { sourceProductId: productId },
    });

    return this.getDetail(tenantId, created.id);
  }

  /**
   * Archive with dependency guard (featureslist.md 3.12). `Listing` now
   * exists (Phase 4) — this closes docs/DEBT.md 2-D8 /
   * docs/OPEN_QUESTIONS.md #20: a product with any listing still in
   * PENDING/QUEUED/LIVE cannot be archived out from under an active
   * channel presence.
   */
  async archive(tenantId: string, userId: string, productId: string): Promise<ProductSummary> {
    const product = await this.products.findById(tenantId, productId);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    await this.assertNoLiveDependencies(tenantId, productId);
    const archived = await this.products.archive(tenantId, productId);
    if (archived === null) {
      throw new NotFoundException('Product not found');
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'product.archived', entityType: 'Product', entityId: productId });
    const variantCount = await this.variants.listForProduct(tenantId, productId);
    return toProductSummary({ ...archived, variantCount: variantCount.length, enabledVariantCount: variantCount.filter((v) => v.isEnabled).length });
  }

  private async assertNoLiveDependencies(tenantId: string, productId: string): Promise<void> {
    const liveListingCount = await this.listings.countLiveForProduct(tenantId, productId);
    if (liveListingCount > 0) {
      throw new ConflictException(`Cannot archive: ${liveListingCount} listing(s) for this product are still pending, queued, or live on a channel`);
    }
  }

  async exportCsv(tenantId: string): Promise<string> {
    const { items } = await this.products.list(tenantId, { limit: 100 });
    const rows: ProductCsvRow[] = [];
    for (const product of items) {
      const variants = await this.variants.listForProduct(tenantId, product.id);
      if (variants.length === 0) {
        rows.push(emptyRow(product));
        continue;
      }
      for (const variant of variants) {
        const defaultPrice = variant.prices.find((p) => p.channel === 'default');
        rows.push({
          productSku: product.sku,
          productName: product.name,
          status: product.status,
          variantSku: variant.sku,
          size: variant.size ?? '',
          color: variant.color ?? '',
          isEnabled: String(variant.isEnabled),
          baseCostMinor: variant.baseCostMinor.toString(),
          priceMinor: defaultPrice?.priceMinor.toString() ?? '',
          currency: defaultPrice?.currency ?? variant.currency,
        });
      }
    }
    return productsToCsv(rows);
  }

  /** Partial-success import (3.10): each row is independent — one bad row
   * never aborts the rest of the file. */
  async importCsv(tenantId: string, userId: string, csvText: string): Promise<{ createdProducts: number; upsertedVariants: number; errors: string[] }> {
    const rows = csvToProductRows(csvText);
    const errors: string[] = [];
    let createdProducts = 0;
    let upsertedVariants = 0;

    for (const [index, row] of rows.entries()) {
      try {
        let product = await this.products.findBySku(tenantId, row.productSku);
        if (product === null) {
          product = await this.products.create({
            tenantId,
            name: row.productName,
            sku: row.productSku,
            status: row.status.length > 0 ? row.status : 'DRAFT',
            priceMinor: 0n,
            currency: row.currency.length > 0 ? row.currency : 'USD',
          });
          createdProducts += 1;
        }
        const existingVariant = (await this.variants.listForProduct(tenantId, product.id)).find((v) => v.sku === row.variantSku);
        if (existingVariant === undefined) {
          await this.variants.createMany([
            {
              tenantId,
              productId: product.id,
              sku: row.variantSku,
              size: row.size.length > 0 ? row.size : null,
              color: row.color.length > 0 ? row.color : null,
              baseCostMinor: BigInt(row.baseCostMinor || '0'),
              currency: row.currency.length > 0 ? row.currency : product.currency,
              isEnabled: row.isEnabled.toLowerCase() !== 'false',
            },
          ]);
        } else {
          await this.variants.update(tenantId, existingVariant.id, {
            isEnabled: row.isEnabled.toLowerCase() !== 'false',
            baseCostMinor: BigInt(row.baseCostMinor || '0'),
          });
        }
        if (row.priceMinor.length > 0) {
          const variant = (await this.variants.listForProduct(tenantId, product.id)).find((v) => v.sku === row.variantSku);
          if (variant !== undefined) {
            await this.variants.upsertPrice({
              tenantId,
              variantId: variant.id,
              channel: 'default',
              currency: row.currency.length > 0 ? row.currency : product.currency,
              priceMinor: BigInt(row.priceMinor),
            });
          }
        }
        upsertedVariants += 1;
      } catch (error) {
        errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'product.csv_imported',
      entityType: 'Product',
      after: { createdProducts, upsertedVariants, errorCount: errors.length },
    });

    return { createdProducts, upsertedVariants, errors };
  }
}

function buildVariantSku(productSku: string, size: string, color: string): string {
  const parts = [productSku, size, color].filter((p) => p.length > 0);
  return parts.join('-').toUpperCase().replace(/\s+/g, '-');
}

function emptyRow(product: { sku: string; name: string; status: string; currency: string }): ProductCsvRow {
  return {
    productSku: product.sku,
    productName: product.name,
    status: product.status,
    variantSku: '',
    size: '',
    color: '',
    isEnabled: '',
    baseCostMinor: '',
    priceMinor: '',
    currency: product.currency,
  };
}

function toProductSummary(row: {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  status: string;
  blueprintId: string | null;
  primaryAssetId: string | null;
  priceMinor: bigint;
  currency: string;
  variantCount: number;
  enabledVariantCount: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    status: row.status,
    blueprintId: row.blueprintId,
    primaryAssetId: row.primaryAssetId,
    priceMinor: row.priceMinor.toString(),
    currency: row.currency,
    variantCount: row.variantCount,
    enabledVariantCount: row.enabledVariantCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toVariantSummary(variant: {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  isEnabled: boolean;
  baseCostMinor: bigint;
  currency: string;
  prices: Array<{ channel: string; currency: string; priceMinor: bigint; compareAtMinor: bigint | null; marginPct: number | null }>;
}): ProductVariantSummary {
  return {
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    isEnabled: variant.isEnabled,
    baseCostMinor: variant.baseCostMinor.toString(),
    currency: variant.currency,
    prices: variant.prices.map((p) => ({
      channel: p.channel,
      currency: p.currency,
      priceMinor: p.priceMinor.toString(),
      compareAtMinor: p.compareAtMinor?.toString() ?? null,
      marginPct: p.marginPct,
    })),
  };
}
