import { describe, expect, it, vi } from 'vitest';
import { DryRunService } from '../src/publishing/dry-run.service';
import { ListingsService } from '../src/publishing/listings/listings.service';
import type { ProductRepository } from '../src/repositories/product.repository';
import type { ProductVariantRepository } from '../src/repositories/product-variant.repository';
import { PublishInputBuilderService } from '../src/publishing/publish-input-builder.service';
import { BannedTermsService } from '../src/publishing/policy/banned-terms.service';
import type { DryRunListingInput } from '@omnisell/shared';

const printfulChannel = { connectionId: 'conn-printful', connectorSlug: 'printful', connectorName: 'Printful', tier: 'A', capabilities: { canAutomate: true, canPublish: true }, fieldSpec: { maxTitle: 20, maxDescription: 500, maxTags: 10, imageSpecs: [] } };
const redbubbleChannel = { connectionId: 'conn-redbubble', connectorSlug: 'redbubble', connectorName: 'Redbubble', tier: 'C', capabilities: { canAutomate: false, canPublish: false }, fieldSpec: { maxTitle: 120, maxDescription: 1000, maxTags: 15, imageSpecs: [] } };

function makeDryRunService(channels: typeof printfulChannel[], violations: unknown[] = []) {
  const listingsService = { resolveChannels: vi.fn().mockResolvedValue(channels), computeEffectiveFields: vi.fn((input: DryRunListingInput, channel: typeof printfulChannel) => ({ title: input.title.slice(0, channel.fieldSpec.maxTitle), description: input.description, tags: input.tags, category: null, warnings: [], counters: { titleLength: input.title.length, titleMax: channel.fieldSpec.maxTitle, descriptionLength: input.description.length, descriptionMax: null, tagCount: input.tags.length, tagMax: null } })) } as unknown as ListingsService;
  const products = { findById: vi.fn().mockResolvedValue({ id: 'product-1' }) } as unknown as ProductRepository;
  const productVariants = { listForProduct: vi.fn().mockResolvedValue([{ id: 'pv-1', sku: 'MUG-11OZ', size: '11oz', color: 'white', baseCostMinor: 500n, currency: 'USD', prices: [] }]) } as unknown as ProductVariantRepository;
  const publishInputBuilder = { build: vi.fn().mockResolvedValue({ input: { listingId: 'x', externalBlueprintId: '1', title: 'a', description: 'b', tags: [], images: [], variants: [] }, warnings: [] }) } as unknown as PublishInputBuilderService;
  const bannedTerms = { lint: vi.fn().mockResolvedValue(violations) } as unknown as BannedTermsService;
  return new DryRunService(listingsService, products, productVariants, publishInputBuilder, bannedTerms);
}

const baseInput: DryRunListingInput = {
  productId: 'product-1',
  connectionIds: [],
  title: 'A very long title that will need truncation for narrow channels',
  description: 'desc',
  tags: ['a', 'b'],
  variants: [{ productVariantId: 'pv-1' }],
  overrides: {},
};

describe('DryRunService', () => {
  it('renders a real adapter.buildPublishPayload() preview for a Tier A channel', async () => {
    const service = makeDryRunService([printfulChannel]);
    const result = await service.run('t1', { ...baseInput, connectionIds: ['conn-printful'] });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]?.isExportPackChannel).toBe(false);
    expect(result.channels[0]?.payloadPreview).not.toBeNull();
    expect(result.channels[0]?.exportPackPreview).toBeNull();
  });

  it('renders an Export Pack text preview (metadata.csv + checklist) for a Tier C channel, no adapter call', async () => {
    const service = makeDryRunService([redbubbleChannel]);
    const result = await service.run('t1', { ...baseInput, connectionIds: ['conn-redbubble'] });
    expect(result.channels[0]?.isExportPackChannel).toBe(true);
    expect(result.channels[0]?.payloadPreview).toBeNull();
    expect(result.channels[0]?.exportPackPreview?.metadataCsv).toContain('title');
    expect(result.channels[0]?.exportPackPreview?.checklistMarkdown).toContain('Redbubble');
  });

  it('supports a mixed multi-channel dry-run in one call', async () => {
    const service = makeDryRunService([printfulChannel, redbubbleChannel]);
    const result = await service.run('t1', { ...baseInput, connectionIds: ['conn-printful', 'conn-redbubble'] });
    expect(result.channels).toHaveLength(2);
  });

  it('marks the whole result blocked when any channel has a policy violation', async () => {
    const service = makeDryRunService([printfulChannel], [{ field: 'title', term: 'Disney', category: 'TRADEMARK', matchType: 'FUZZY', matchedText: 'Disney' }]);
    const result = await service.run('t1', { ...baseInput, connectionIds: ['conn-printful'] });
    expect(result.blocked).toBe(true);
    expect(result.channels[0]?.policyViolations).toHaveLength(1);
  });

  it('is not blocked when there are no policy violations', async () => {
    const service = makeDryRunService([printfulChannel], []);
    const result = await service.run('t1', { ...baseInput, connectionIds: ['conn-printful'] });
    expect(result.blocked).toBe(false);
  });
});
