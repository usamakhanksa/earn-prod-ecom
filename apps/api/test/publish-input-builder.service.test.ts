import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PublishInputBuilderService } from '../src/publishing/publish-input-builder.service';
import type { ProductRepository } from '../src/repositories/product.repository';
import type { ProductVariantRepository } from '../src/repositories/product-variant.repository';
import type { AssetRepository } from '../src/repositories/asset.repository';
import type { BlueprintRepository } from '../src/repositories/blueprint.repository';

function makeDeps() {
  const products = { findById: vi.fn().mockResolvedValue({ id: 'product-1', blueprintId: 'blueprint-1', primaryAssetId: 'asset-1' }) };
  const productVariants = {
    listForProduct: vi.fn().mockResolvedValue([{ id: 'pv-1', sku: 'MUG-11OZ', blueprintVariantId: 'bv-1' }]),
  };
  const assets = { findById: vi.fn().mockResolvedValue({ id: 'asset-1', storageKey: 'tenants/t1/assets/asset-1.png' }) };
  const blueprints = {
    findById: vi.fn().mockResolvedValue({ id: 'blueprint-1', providerSlug: 'printful', providerBlueprintId: '71', variants: [{ id: 'bv-1', providerVariantId: '4011' }] }),
  };
  return { products, productVariants, assets, blueprints };
}

function makeService(deps: ReturnType<typeof makeDeps>): PublishInputBuilderService {
  return new PublishInputBuilderService(
    deps.products as unknown as ProductRepository,
    deps.productVariants as unknown as ProductVariantRepository,
    deps.assets as unknown as AssetRepository,
    deps.blueprints as unknown as BlueprintRepository,
  );
}

const listing = { id: 'listing-1', productId: 'product-1', connectorSlug: 'printful', title: 'Sunset Mug', description: 'desc', tags: ['a'] };
const variants = [{ productVariantId: 'pv-1', priceMinor: 1999n, currency: 'USD' }];

describe('PublishInputBuilderService', () => {
  it('builds a real PublishInput with the mapped provider blueprint/variant IDs and no warnings when everything matches', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const { input, warnings } = await service.build('t1', listing, variants);
    expect(input.externalBlueprintId).toBe('71');
    expect(input.variants).toEqual([{ providerVariantId: '4011', priceMinor: 1999n, currency: 'USD' }]);
    expect(input.images[0]?.url).toContain('asset-1.png');
    expect(warnings).toHaveLength(0);
  });

  it('warns instead of fabricating an externalBlueprintId when the cached blueprint is from a different provider', async () => {
    const deps = makeDeps();
    deps.blueprints.findById.mockResolvedValue({ id: 'blueprint-1', providerSlug: 'printify', providerBlueprintId: '999', variants: [] });
    const service = makeService(deps);
    const { input, warnings } = await service.build('t1', listing, variants);
    expect(input.externalBlueprintId).toBe('');
    expect(warnings.some((w) => w.includes('printify'))).toBe(true);
  });

  it('skips a variant with no provider mapping and warns, rather than inventing a providerVariantId', async () => {
    const deps = makeDeps();
    deps.productVariants.listForProduct.mockResolvedValue([{ id: 'pv-1', sku: 'MUG-11OZ', blueprintVariantId: null }]);
    const service = makeService(deps);
    const { input, warnings } = await service.build('t1', listing, variants);
    expect(input.variants).toHaveLength(0);
    expect(warnings.some((w) => w.includes('No variant has a resolvable'))).toBe(true);
  });

  it('warns when the product has no primary asset, and includes no image', async () => {
    const deps = makeDeps();
    deps.products.findById.mockResolvedValue({ id: 'product-1', blueprintId: 'blueprint-1', primaryAssetId: null });
    const service = makeService(deps);
    const { input, warnings } = await service.build('t1', listing, variants);
    expect(input.images).toHaveLength(0);
    expect(warnings.some((w) => w.includes('primary design asset'))).toBe(true);
  });

  it('throws NotFoundException for an unknown product', async () => {
    const deps = makeDeps();
    deps.products.findById.mockResolvedValue(null);
    const service = makeService(deps);
    await expect(service.build('t1', listing, variants)).rejects.toThrow(NotFoundException);
  });
});
