import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublishInput } from '@omnisell/connectors';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { AssetRepository } from '../repositories/asset.repository';
import { BlueprintRepository } from '../repositories/blueprint.repository';
import { env } from '../config/env';

export interface BuiltPublishInput {
  input: PublishInput;
  warnings: string[];
}

/** Plain data shape — deliberately NOT a Prisma `Listing`/`ListingVariant`
 * row, so the exact same builder serves both a genuinely persisted Listing
 * (the real publish path) and an ad-hoc, never-saved dry-run preview built
 * straight from composer input (featureslist.md 5.5 — "before submit"). */
export interface ListingLikeInput {
  id: string;
  productId: string;
  connectorSlug: string;
  title: string;
  description: string;
  tags: string[];
}

export interface ListingVariantLikeInput {
  productVariantId: string;
  priceMinor: bigint;
  currency: string;
}

/**
 * The ONE place a `Listing` row becomes the `PublishInput` shape every
 * adapter's `publish`/`update`/`buildPublishPayload` expects
 * (implentationplanphase.md task 4.4's "do not duplicate the payload-shaping
 * logic" — this is the layer BELOW that: turning OmniSell's own data into the
 * SDK's input, which the dry-run endpoint and the real publish orchestrator
 * both call so a preview can never diverge from what actually gets sent).
 *
 * Honest limitation (docs/DEBT.md): a `Listing`'s `externalBlueprintId` can
 * only be resolved when the product's cached `Blueprint.providerSlug`
 * matches the target channel's connector slug — there is no cross-provider
 * blueprint mapping in this codebase (Phase 2/3 never built one, since each
 * provider's blueprint IDs are provider-specific). When it does not match,
 * this returns an empty `externalBlueprintId` and a warning, rather than
 * fabricating one.
 */
@Injectable()
export class PublishInputBuilderService {
  constructor(
    private readonly products: ProductRepository,
    private readonly productVariants: ProductVariantRepository,
    private readonly assets: AssetRepository,
    private readonly blueprints: BlueprintRepository,
  ) {}

  async build(tenantId: string, listing: ListingLikeInput, listingVariants: ListingVariantLikeInput[]): Promise<BuiltPublishInput> {
    const warnings: string[] = [];
    const product = await this.products.findById(tenantId, listing.productId);
    if (product === null) {
      throw new NotFoundException('Product not found for this listing');
    }

    let externalBlueprintId = '';
    let blueprint: Awaited<ReturnType<BlueprintRepository['findById']>> = null;
    if (product.blueprintId !== null) {
      blueprint = await this.blueprints.findById(tenantId, product.blueprintId);
      if (blueprint !== null && blueprint.providerSlug === listing.connectorSlug) {
        externalBlueprintId = blueprint.providerBlueprintId;
      } else if (blueprint !== null) {
        warnings.push(`Product's cached blueprint is from "${blueprint.providerSlug}", not "${listing.connectorSlug}" — no cross-provider blueprint mapping exists, externalBlueprintId is empty`);
      }
    } else {
      warnings.push('Product has no blueprint assigned — externalBlueprintId is empty');
    }

    const productVariantRows = await this.productVariants.listForProduct(tenantId, listing.productId);
    const productVariantById = new Map(productVariantRows.map((v) => [v.id, v]));

    const variants: PublishInput['variants'] = [];
    for (const lv of listingVariants) {
      const pv = productVariantById.get(lv.productVariantId);
      const blueprintVariant = pv?.blueprintVariantId !== null && pv?.blueprintVariantId !== undefined ? blueprint?.variants.find((bv) => bv.id === pv.blueprintVariantId) : undefined;
      if (blueprintVariant === undefined) {
        warnings.push(`No provider variant mapping for SKU "${pv?.sku ?? lv.productVariantId}" — skipped from the payload`);
        continue;
      }
      variants.push({ providerVariantId: blueprintVariant.providerVariantId, priceMinor: lv.priceMinor, currency: lv.currency });
    }
    if (variants.length === 0) {
      warnings.push('No variant has a resolvable provider variant ID — the real publish call would be rejected by the adapter');
    }

    const images: PublishInput['images'] = [];
    if (product.primaryAssetId !== null) {
      const asset = await this.assets.findById(tenantId, product.primaryAssetId);
      if (asset !== null) {
        images.push({ placement: 'default', url: `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${asset.storageKey}` });
      } else {
        warnings.push('Primary design asset not found — no image included in the payload');
      }
    } else {
      warnings.push('Product has no primary design asset assigned — no image included in the payload');
    }

    const input: PublishInput = {
      listingId: listing.id,
      externalBlueprintId,
      title: listing.title,
      description: listing.description,
      tags: listing.tags,
      images,
      variants,
    };
    return { input, warnings };
  }
}
