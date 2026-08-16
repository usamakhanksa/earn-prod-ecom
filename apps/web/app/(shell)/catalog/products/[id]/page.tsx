'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type {
  AssetSummary,
  BlueprintSummary,
  MarginPreviewResult,
  PlacementSummary,
  PricingRuleSummary,
  ProductDetail,
} from '@omnisell/shared';
import { PLACEMENT_CODES, ROUNDING_MODES } from '@omnisell/shared';
import { Badge, Button, MarginWaterfallChart, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

export default function ProductBuilderPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId, currentTenant } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isNew = params.id === 'new';

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [blueprintId, setBlueprintId] = useState('');

  const [blueprints, setBlueprints] = useState<BlueprintSummary[] | null>(null);
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRuleSummary[] | null>(null);

  const [sizesSelected, setSizesSelected] = useState<Set<string>>(new Set());
  const [colorsSelected, setColorsSelected] = useState<Set<string>>(new Set());
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  const [placementCode, setPlacementCode] = useState<string>(PLACEMENT_CODES[0]);
  const [placementAssetId, setPlacementAssetId] = useState('');
  const [xPct, setXPct] = useState(50);
  const [yPct, setYPct] = useState(35);
  const [scalePct, setScalePct] = useState(80);
  const [rotationDeg, setRotationDeg] = useState(0);

  const [previewVariantId, setPreviewVariantId] = useState('');
  const [channelFeePct, setChannelFeePct] = useState(0);
  const [shippingMinor, setShippingMinor] = useState('0');
  const [taxPct, setTaxPct] = useState(0);
  const [marginResult, setMarginResult] = useState<MarginPreviewResult | null>(null);

  const selectedBlueprint = blueprints?.find((b) => b.id === blueprintId) ?? null;

  const loadProduct = useCallback(async () => {
    if (isNew || currentTenantId === null) return;
    setLoadError(null);
    try {
      const detail = await client.get<ProductDetail>(`/products/${params.id}`);
      setProduct(detail);
      setName(detail.name);
      setSku(detail.sku);
      setDescription(detail.description ?? '');
      setBlueprintId(detail.blueprintId ?? '');
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, isNew, params.id, t]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    if (currentTenantId === null) return;
    void client.get<BlueprintSummary[]>('/blueprints').then(setBlueprints).catch(() => setBlueprints([]));
    void client
      .get<{ items: AssetSummary[] }>('/assets', { limit: 100 })
      .then((page) => setAssets(page.items.filter((a) => a.status === 'READY')))
      .catch(() => setAssets([]));
    void client.get<PricingRuleSummary[]>('/pricing-rules').then(setPricingRules).catch(() => setPricingRules([]));
  }, [client, currentTenantId]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        const created = await client.post<ProductDetail>(
          '/products',
          { name, sku, description: description.length > 0 ? description : undefined, blueprintId: blueprintId.length > 0 ? blueprintId : undefined },
          crypto.randomUUID(),
        );
        router.replace(`/catalog/products/${created.id}`);
        return;
      }
      const updated = await client.patch<ProductDetail>(`/products/${params.id}`, { name, description });
      setProduct(updated);
    } catch (error) {
      setSaveError(error instanceof ApiRequestError ? error.message : t('catalog.builder.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateMatrix(): Promise<void> {
    if (product === null) return;
    await client.post(`/products/${product.id}/variants:bulk`, {
      sizes: Array.from(sizesSelected),
      colors: Array.from(colorsSelected),
    });
    await loadProduct();
  }

  async function handleBulkToggle(isEnabled: boolean): Promise<void> {
    if (product === null || selectedVariantIds.size === 0) return;
    await client.patch(`/products/${product.id}/variants:bulk`, {
      variantIds: Array.from(selectedVariantIds),
      isEnabled,
    });
    await loadProduct();
  }

  async function handleSavePlacement(): Promise<void> {
    if (product === null || placementAssetId.length === 0) return;
    await client.post<PlacementSummary>(`/products/${product.id}/placements`, {
      placementCode,
      assetId: placementAssetId,
      xPct: xPct / 100,
      yPct: yPct / 100,
      scalePct,
      rotationDeg,
    });
    await loadProduct();
  }

  async function handleDuplicate(): Promise<void> {
    if (product === null) return;
    const newSku = window.prompt(t('catalog.builder.duplicateSkuPrompt'), `${product.sku}-COPY`);
    if (newSku === null || newSku.trim().length === 0) return;
    const duplicated = await client.post<ProductDetail>(
      `/products/${product.id}/duplicate`,
      { newSku: newSku.trim(), includeVariants: true, includePlacements: true },
      crypto.randomUUID(),
    );
    router.push(`/catalog/products/${duplicated.id}`);
  }

  async function handleArchive(): Promise<void> {
    if (product === null) return;
    if (!window.confirm(t('catalog.products.archiveConfirm'))) return;
    await client.post(`/products/${product.id}/archive`, {});
    router.push('/catalog/products');
  }

  const runMarginPreview = useCallback(async () => {
    if (product === null) return;
    const variant = product.variants.find((v) => v.id === previewVariantId);
    if (variant === undefined) return;
    const defaultPrice = variant.prices.find((p) => p.channel === 'default');
    try {
      const result = await client.post<MarginPreviewResult>('/pricing/preview', {
        baseCostMinor: variant.baseCostMinor,
        priceMinor: defaultPrice?.priceMinor ?? variant.baseCostMinor,
        currency: variant.currency,
        channelFeePct,
        channelFeeFixedMinor: '0',
        shippingMinor,
        taxPct,
      });
      setMarginResult(result);
    } catch {
      setMarginResult(null);
    }
  }, [channelFeePct, client, previewVariantId, product, shippingMinor, taxPct]);

  useEffect(() => {
    if (previewVariantId.length > 0) {
      void runMarginPreview();
    }
  }, [previewVariantId, runMarginPreview]);

  const currency = product?.currency ?? currentTenant?.currency ?? 'USD';

  if (!isNew && loadError !== null) {
    return (
      <div role="alert" className="mx-auto max-w-2xl rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        <p>{loadError}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => void loadProduct()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (!isNew && product === null) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{isNew ? t('catalog.builder.titleNew') : t('catalog.builder.titleEdit')}</h1>
        {product !== null ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void handleDuplicate()}>
              {t('catalog.builder.duplicateButton')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleArchive()}>
              {t('catalog.builder.archiveButton')}
            </Button>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="basic-heading" className="rounded-lg border border-border-subtle p-5 shadow-sh1">
        <h2 id="basic-heading" className="text-sm font-semibold text-text-primary">
          {t('catalog.builder.basicSection')}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('catalog.builder.nameLabel')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('catalog.builder.skuLabel')}</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={!isNew} className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm disabled:opacity-60" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-text-primary">{t('catalog.builder.descriptionLabel')}</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm" rows={2} />
          </label>
          {isNew ? (
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-text-primary">{t('catalog.builder.blueprintLabel')}</span>
              <select value={blueprintId} onChange={(e) => setBlueprintId(e.target.value)} className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm">
                <option value="">{t('catalog.builder.blueprintPlaceholder')}</option>
                {(blueprints ?? []).map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {saveError !== null ? <p role="alert" className="mt-2 text-sm text-danger">{saveError}</p> : null}
        <Button className="mt-4" loading={saving} onClick={() => void handleSave()}>
          {isNew ? t('catalog.builder.createButton') : t('catalog.builder.saveButton')}
        </Button>
      </section>

      {product !== null ? (
        <>
          <section aria-labelledby="matrix-heading" className="rounded-lg border border-border-subtle p-5 shadow-sh1">
            <h2 id="matrix-heading" className="text-sm font-semibold text-text-primary">
              {t('catalog.builder.matrixSection')}
            </h2>
            {selectedBlueprint === null ? (
              <p className="mt-2 text-xs text-text-secondary">{t('catalog.builder.matrixNeedsBlueprint')}</p>
            ) : (
              <div className="mt-3 space-y-3">
                <fieldset>
                  <legend className="text-xs font-medium text-text-secondary">{t('catalog.builder.selectSizes')}</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {selectedBlueprint.sizes.map((size) => (
                      <label key={size} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={sizesSelected.has(size)}
                          onChange={(e) => setSizesSelected((prev) => toggleSet(prev, size, e.target.checked))}
                        />
                        {size}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-xs font-medium text-text-secondary">{t('catalog.builder.selectColors')}</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {selectedBlueprint.colors.map((color) => (
                      <label key={color.name} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={colorsSelected.has(color.name)}
                          onChange={(e) => setColorsSelected((prev) => toggleSet(prev, color.name, e.target.checked))}
                        />
                        {color.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button
                  size="sm"
                  disabled={sizesSelected.size === 0 || colorsSelected.size === 0}
                  onClick={() => void handleGenerateMatrix()}
                >
                  {t('catalog.builder.generateMatrix')}
                </Button>
              </div>
            )}

            {product.variants.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-surface-2 uppercase text-text-secondary">
                    <tr>
                      <th className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={t('catalog.builder.variantTable.selectAll')}
                          checked={selectedVariantIds.size === product.variants.length}
                          onChange={(e) =>
                            setSelectedVariantIds(e.target.checked ? new Set(product.variants.map((v) => v.id)) : new Set())
                          }
                        />
                      </th>
                      <th className="px-2 py-2 text-start">{t('catalog.builder.variantTable.sku')}</th>
                      <th className="px-2 py-2 text-start">{t('catalog.builder.variantTable.size')}</th>
                      <th className="px-2 py-2 text-start">{t('catalog.builder.variantTable.color')}</th>
                      <th className="px-2 py-2 text-start">{t('catalog.builder.variantTable.enabled')}</th>
                      <th className="px-2 py-2 text-start">{t('catalog.builder.variantTable.cost')}</th>
                      <th className="px-2 py-2 text-start">{t('catalog.builder.variantTable.price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant) => (
                      <tr key={variant.id} className="border-t border-border-subtle">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={selectedVariantIds.has(variant.id)}
                            onChange={(e) => setSelectedVariantIds((prev) => toggleSet(prev, variant.id, e.target.checked))}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono">{variant.sku}</td>
                        <td className="px-2 py-1.5">{variant.size}</td>
                        <td className="px-2 py-1.5">{variant.color}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={variant.isEnabled ? 'success' : 'neutral'}>{variant.isEnabled ? '✓' : '—'}</Badge>
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{formatMoneyMinor(variant.baseCostMinor, variant.currency, locale)}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {variant.prices[0] !== undefined ? formatMoneyMinor(variant.prices[0].priceMinor, variant.prices[0].currency, locale) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" size="sm" disabled={selectedVariantIds.size === 0} onClick={() => void handleBulkToggle(true)}>
                    {t('catalog.builder.bulkEnable')}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={selectedVariantIds.size === 0} onClick={() => void handleBulkToggle(false)}>
                    {t('catalog.builder.bulkDisable')}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="placement-heading" className="rounded-lg border border-border-subtle p-5 shadow-sh1">
            <h2 id="placement-heading" className="text-sm font-semibold text-text-primary">
              {t('catalog.builder.placementSection')}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.placementCodeLabel')}</span>
                <select value={placementCode} onChange={(e) => setPlacementCode(e.target.value)} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs">
                  {PLACEMENT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.assetLabel')}</span>
                <select value={placementAssetId} onChange={(e) => setPlacementAssetId(e.target.value)} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs">
                  <option value="">{t('catalog.builder.assetPlaceholder')}</option>
                  {(assets ?? []).map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.positionX')}</span>
                <input type="number" min={0} max={100} value={xPct} onChange={(e) => setXPct(Number(e.target.value))} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.positionY')}</span>
                <input type="number" min={0} max={100} value={yPct} onChange={(e) => setYPct(Number(e.target.value))} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.scaleLabel')}</span>
                <input type="number" min={1} max={500} value={scalePct} onChange={(e) => setScalePct(Number(e.target.value))} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.rotationLabel')}</span>
                <input type="number" min={-180} max={180} value={rotationDeg} onChange={(e) => setRotationDeg(Number(e.target.value))} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
              </label>
            </div>
            <Button size="sm" className="mt-3" disabled={placementAssetId.length === 0} onClick={() => void handleSavePlacement()}>
              {t('catalog.builder.savePlacement')}
            </Button>

            {product.placements.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-text-secondary">
                {product.placements.map((placement) => (
                  <li key={placement.id}>
                    {placement.placementCode}: {Math.round(placement.xPct * 100)}%, {Math.round(placement.yPct * 100)}% · {placement.scalePct}% · {placement.rotationDeg}°
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-labelledby="margin-heading" className="rounded-lg border border-border-subtle p-5 shadow-sh1">
            <h2 id="margin-heading" className="text-sm font-semibold text-text-primary">
              {t('catalog.builder.marginPreviewSection')}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="text-xs sm:col-span-2">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.previewVariantLabel')}</span>
                <select value={previewVariantId} onChange={(e) => setPreviewVariantId(e.target.value)} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs">
                  <option value="">—</option>
                  {product.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.channelFeeLabel')}</span>
                <input type="number" min={0} max={100} value={channelFeePct} onChange={(e) => setChannelFeePct(Number(e.target.value))} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.taxLabel')}</span>
                <input type="number" min={0} max={100} value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} className="w-full rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
              </label>
              <label className="text-xs sm:col-span-4">
                <span className="mb-1 block text-text-secondary">{t('catalog.builder.shippingLabel')}</span>
                <input
                  type="number"
                  min={0}
                  value={Number(shippingMinor) / 100}
                  onChange={(e) => setShippingMinor(String(Math.round(Number(e.target.value) * 100)))}
                  className="w-32 rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs"
                />
              </label>
            </div>

            {marginResult !== null ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-text-primary tabular-nums">
                  {t('catalog.builder.marginResult', { pct: Math.round(marginResult.marginPct * 10) / 10 })}
                </p>
                <MarginWaterfallChart
                  steps={marginResult.waterfall}
                  currency={marginResult.currency}
                  formatLabel={(key) => t(key)}
                  formatMoney={(amountMinor, curr) => formatMoneyMinor(amountMinor, curr, locale)}
                />
              </div>
            ) : null}
          </section>

          <PricingRulePicker
            productCurrency={currency}
            rules={pricingRules}
            client={client}
            onCreated={(rule) => setPricingRules((prev) => [...(prev ?? []), rule])}
          />
        </>
      ) : null}
    </div>
  );
}

function toggleSet<T>(set: Set<T>, value: T, include: boolean): Set<T> {
  const next = new Set(set);
  if (include) next.add(value);
  else next.delete(value);
  return next;
}

/** Quick inline pricing-rule creator (3.6) — kept small since the full rules
 * management screen (Catalog > Pricing Rules) stays on the "coming soon"
 * path this phase per the task's own scoping instructions. */
function PricingRulePicker({
  rules,
  client,
  onCreated,
}: {
  productCurrency: string;
  rules: PricingRuleSummary[] | null;
  client: ReturnType<typeof useSession>['client'];
  onCreated: (rule: PricingRuleSummary) => void;
}): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const [ruleName, setRuleName] = useState('');
  const [marginPct, setMarginPct] = useState(40);
  const [roundingMode, setRoundingMode] = useState<string>('PSYCHOLOGICAL_99');
  const [busy, setBusy] = useState(false);

  async function handleCreate(): Promise<void> {
    if (ruleName.trim().length === 0) return;
    setBusy(true);
    try {
      const created = await client.post<PricingRuleSummary>('/pricing-rules', {
        name: ruleName,
        method: 'FIXED_MARGIN',
        fixedMarginPct: marginPct,
        roundingMode,
        isActive: true,
      });
      onCreated(created);
      setRuleName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="pricing-heading" className="rounded-lg border border-border-subtle p-5 shadow-sh1">
      <h2 id="pricing-heading" className="text-sm font-semibold text-text-primary">
        {t('catalog.builder.pricingSection')}
      </h2>
      <ul className="mt-2 space-y-1 text-xs text-text-secondary">
        {(rules ?? []).map((rule) => (
          <li key={rule.id}>
            {rule.name} — {rule.method} {rule.fixedMarginPct !== null ? `(${rule.fixedMarginPct}%)` : ''} · {rule.roundingMode}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-text-secondary">{t('catalog.builder.pricingRuleLabel')}</span>
          <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-text-secondary">%</span>
          <input type="number" min={0} max={99} value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value))} className="w-20 rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-text-secondary">Rounding</span>
          <select value={roundingMode} onChange={(e) => setRoundingMode(e.target.value)} className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs">
            {ROUNDING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" loading={busy} onClick={() => void handleCreate()}>
          +
        </Button>
      </div>
    </section>
  );
}
