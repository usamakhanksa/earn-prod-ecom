import { Injectable, NotFoundException } from '@nestjs/common';
import { getAdapter } from '@omnisell/connectors';
import type { Ctx } from '@omnisell/connectors';
import type { DryRunListingInput, DryRunResult, DryRunChannelResult } from '@omnisell/shared';
import { ListingsService, resolveVariantPrice } from './listings/listings.service';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { PublishInputBuilderService } from './publish-input-builder.service';
import { BannedTermsService } from './policy/banned-terms.service';
import { previewExportPackText } from './export-packs/export-pack-builder';

/**
 * Dry-run endpoint's service (implentationplanphase.md task 4.4,
 * featureslist.md 5.5 — "shows exactly what each channel will receive").
 * Calls the EXACT same code paths the real publish flow uses:
 *  - `ListingsService.computeEffectiveFields` (field-transform engine)
 *  - `PublishInputBuilderService.build` (Listing -> PublishInput)
 *  - `adapter.buildPublishPayload` (the same function `publish()` calls)
 *  - `BannedTermsService.lint` (the exact hard-gate the orchestrator enforces)
 * No second implementation of any of these exists — a dry-run preview
 * cannot silently drift from what a real publish call would do.
 */
@Injectable()
export class DryRunService {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly products: ProductRepository,
    private readonly productVariants: ProductVariantRepository,
    private readonly publishInputBuilder: PublishInputBuilderService,
    private readonly bannedTerms: BannedTermsService,
  ) {}

  async run(tenantId: string, input: DryRunListingInput, locale: 'en' | 'ar' = 'en'): Promise<DryRunResult> {
    const product = await this.products.findById(tenantId, input.productId);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    const channels = await this.listingsService.resolveChannels(tenantId, input.connectionIds);
    const allProductVariants = await this.productVariants.listForProduct(tenantId, input.productId);
    const variantById = new Map(allProductVariants.map((v) => [v.id, v]));

    const results: DryRunChannelResult[] = [];
    for (const channel of channels) {
      const effective = this.listingsService.computeEffectiveFields(input, channel);
      const policyViolations = await this.bannedTerms.lint({ title: effective.title, description: effective.description, tags: effective.tags });

      const resolvedVariants = input.variants.map((selection) => {
        const pv = variantById.get(selection.productVariantId);
        if (pv === undefined) {
          return { productVariantId: selection.productVariantId, priceMinor: 0n, currency: 'USD' };
        }
        const resolved = resolveVariantPrice(pv, selection, channel.connectorSlug);
        return { productVariantId: selection.productVariantId, priceMinor: resolved.priceMinor, currency: resolved.currency };
      });

      let payloadPreview: unknown = null;
      let exportPackPreview: DryRunChannelResult['exportPackPreview'] = null;
      const isExportPackChannel = channel.capabilities.canAutomate !== true;

      if (!isExportPackChannel && channel.capabilities.canPublish) {
        const { input: publishInput } = await this.publishInputBuilder.build(
          tenantId,
          { id: 'dry-run-preview', productId: input.productId, connectorSlug: channel.connectorSlug, title: effective.title, description: effective.description, tags: effective.tags },
          resolvedVariants,
        );
        const adapter = getAdapter(channel.connectorSlug);
        const ctx: Ctx = { tenantId, connectionId: channel.connectionId, sandbox: false };
        payloadPreview = adapter?.buildPublishPayload?.(ctx, publishInput) ?? null;
      } else {
        const preview = previewExportPackText({
          channelSlug: channel.connectorSlug,
          channelName: channel.connectorName,
          listingTitle: effective.title,
          effectiveTitle: effective.title,
          effectiveDescription: effective.description,
          effectiveTags: effective.tags,
          category: effective.category,
          variants: resolvedVariants.map((v) => {
            const pv = variantById.get(v.productVariantId);
            return { sku: pv?.sku ?? v.productVariantId, size: pv?.size ?? null, color: pv?.color ?? null, priceMinor: v.priceMinor, currency: v.currency };
          }),
          fieldSpec: channel.fieldSpec,
          locale,
        });
        exportPackPreview = { ...preview, fileCount: 5 }; // print-files (>=1) + mockups (0+) + csv + field-cards + checklist, an estimate ahead of real generation
      }

      results.push({
        connectionId: channel.connectionId,
        connectorSlug: channel.connectorSlug,
        tier: channel.tier,
        isExportPackChannel,
        effectiveTitle: effective.title,
        effectiveDescription: effective.description,
        effectiveTags: effective.tags,
        fieldSpec: channel.fieldSpec,
        counters: effective.counters,
        warnings: effective.warnings,
        payloadPreview,
        exportPackPreview,
        policyViolations,
      });
    }

    return { channels: results, blocked: results.some((r) => r.policyViolations.length > 0) };
  }
}
