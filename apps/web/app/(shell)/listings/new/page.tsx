'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type {
  ConnectionSummary,
  ConnectorDefinitionSummary,
  ConnectorFieldSpec,
  DryRunResult,
  ListingComposerInput,
  ProductDetail,
  ProductSummary,
} from '@omnisell/shared';
import { Badge, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * Listing composer (featureslist.md 5.1/5.2, implentationplanphase.md task
 * 4.2) — channel-aware form with live character/tag counters driven by each
 * connector's REAL `fieldSpec` from the registry (`GET /connectors`), not a
 * hardcoded limit. Dry-run (5.5) calls the exact same endpoint the publish
 * button does, before anything is queued.
 */
export default function NewListingPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();
  const router = useRouter();

  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null);
  const [connectors, setConnectors] = useState<ConnectorDefinitionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [connectionIds, setConnectionIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [variantIds, setVariantIds] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledTimezone, setScheduledTimezone] = useState('UTC');

  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState<'dry-run' | 'draft' | 'publish' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (currentTenantId === null) return;
    void Promise.all([
      client.get<{ items: ProductSummary[]; nextCursor: string | null }>('/products'),
      client.get<ConnectionSummary[]>('/connections'),
      client.get<ConnectorDefinitionSummary[]>('/connectors'),
    ])
      .then(([productList, connectionList, connectorList]) => {
        setProducts(productList.items);
        setConnections(connectionList);
        setConnectors(connectorList);
      })
      .catch((error: unknown) => setLoadError(error instanceof ApiRequestError ? error.message : t('common.error')));
  }, [client, currentTenantId, t]);

  useEffect(() => {
    if (productId.length === 0) {
      setProductDetail(null);
      return;
    }
    void client.get<ProductDetail>(`/products/${productId}`).then((detail) => {
      setProductDetail(detail);
      setTitle(detail.name);
      setVariantIds(new Set(detail.variants.filter((v) => v.isEnabled).map((v) => v.id)));
    });
  }, [client, productId]);

  const fieldSpecFor = useCallback(
    (connectorSlug: string): ConnectorFieldSpec | null => (connectors?.find((c) => c.slug === connectorSlug)?.fieldSpec as ConnectorFieldSpec | undefined) ?? null,
    [connectors],
  );

  function buildInput(): ListingComposerInput {
    return {
      productId,
      connectionIds: [...connectionIds],
      title,
      description,
      tags: tags.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0),
      variants: [...variantIds].map((id) => ({ productVariantId: id })),
      overrides: {},
      ...(scheduledAt.length > 0 ? { scheduledAt: new Date(scheduledAt).toISOString(), scheduledTimezone } : {}),
    };
  }

  async function handleDryRun(): Promise<void> {
    setActionError(null);
    setBusy('dry-run');
    try {
      const result = await client.post<DryRunResult>('/listings:dry-run', buildInput());
      setDryRun(result);
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveDraft(): Promise<void> {
    setActionError(null);
    setBusy('draft');
    try {
      await client.post('/listings', buildInput(), crypto.randomUUID());
      router.push('/listings/drafts');
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish(): Promise<void> {
    setActionError(null);
    setBusy('publish');
    try {
      const result = await client.post<{ syncJobId: string }>('/listings:publish', buildInput(), crypto.randomUUID());
      // Straight into the live pipeline view (signature moment #2) — the
      // whole point of one-action multi-channel publish is watching it happen.
      router.push(`/channels/sync-queue/${result.syncJobId}`);
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  function toggleConnection(id: string): void {
    const next = new Set(connectionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setConnectionIds(next);
  }

  function toggleVariant(id: string): void {
    const next = new Set(variantIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVariantIds(next);
  }

  const selectedConnections = connections?.filter((c) => connectionIds.has(c.id)) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('listings.composer.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('listings.composer.subtitle')}</p>
      </header>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {loadError}
        </div>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border-subtle bg-surface-1 p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('listings.composer.productField')}</span>
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          >
            <option value="">{t('listings.composer.productPlaceholder')}</option>
            {products?.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-text-primary">{t('listings.composer.channelsField')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {connections?.map((connection) => (
              <label key={connection.id} className="flex items-center gap-2 rounded-md border border-border-subtle p-2 text-sm">
                <input type="checkbox" checked={connectionIds.has(connection.id)} onChange={() => toggleConnection(connection.id)} />
                <span>{connection.label}</span>
                <Badge tone="neutral">{connection.connectorSlug}</Badge>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('listings.composer.titleField')}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
          <div className="mt-1 flex gap-3 text-xs text-text-secondary">
            {selectedConnections.map((connection) => {
              const spec = fieldSpecFor(connection.connectorSlug);
              return spec !== null ? (
                <span key={connection.id} className={title.length > spec.maxTitle ? 'text-danger' : ''}>
                  {connection.connectorSlug}: {title.length}/{spec.maxTitle}
                </span>
              ) : null;
            })}
          </div>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('listings.composer.descriptionField')}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('listings.composer.tagsField')}</span>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={t('listings.composer.tagsPlaceholder')}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
          <div className="mt-1 flex gap-3 text-xs text-text-secondary">
            {selectedConnections.map((connection) => {
              const spec = fieldSpecFor(connection.connectorSlug);
              const count = tags.split(',').filter((tg) => tg.trim().length > 0).length;
              return spec !== null ? (
                <span key={connection.id} className={count > spec.maxTags ? 'text-danger' : ''}>
                  {connection.connectorSlug}: {count}/{spec.maxTags} {t('listings.composer.tagsUnit')}
                </span>
              ) : null;
            })}
          </div>
        </label>

        {productDetail !== null ? (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-text-primary">{t('listings.composer.variantsField')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {productDetail.variants.map((variant) => (
                <label key={variant.id} className="flex items-center gap-2 rounded-md border border-border-subtle p-2 text-sm">
                  <input type="checkbox" checked={variantIds.has(variant.id)} onChange={() => toggleVariant(variant.id)} />
                  <span>{variant.sku}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('listings.composer.scheduleField')}</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('listings.composer.timezoneField')}</span>
            <input
              value={scheduledTimezone}
              onChange={(event) => setScheduledTimezone(event.target.value)}
              placeholder="Asia/Riyadh"
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>
      </section>

      {actionError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" loading={busy === 'dry-run'} disabled={productId.length === 0 || connectionIds.size === 0} onClick={() => void handleDryRun()}>
          {t('listings.composer.dryRunButton')}
        </Button>
        <Button variant="secondary" loading={busy === 'draft'} disabled={productId.length === 0 || connectionIds.size === 0} onClick={() => void handleSaveDraft()}>
          {t('listings.composer.saveDraftButton')}
        </Button>
        <Button variant="primary" loading={busy === 'publish'} disabled={productId.length === 0 || connectionIds.size === 0} onClick={() => void handlePublish()}>
          {t('listings.composer.publishButton')}
        </Button>
      </div>

      {dryRun !== null ? (
        <section aria-label={t('listings.composer.dryRunResultsLabel')} className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('listings.composer.dryRunResultsLabel')}
            {dryRun.blocked ? <Badge tone="danger" className="ms-2">{t('listings.composer.blockedBadge')}</Badge> : null}
          </h2>
          {dryRun.channels.map((channel) => (
            <div key={channel.connectionId} className="rounded-lg border border-border-subtle bg-surface-1 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium text-text-primary">
                  {channel.connectorSlug} ({channel.tier})
                </h3>
                <Badge tone={channel.isExportPackChannel ? 'warning' : 'success'}>
                  {channel.isExportPackChannel ? t('listings.composer.exportPackRoute') : t('listings.composer.automatedRoute')}
                </Badge>
              </div>
              {channel.policyViolations.length > 0 ? (
                <p role="alert" className="mb-2 text-sm text-danger">
                  {t('listings.composer.policyViolation', { term: channel.policyViolations[0]?.term ?? '' })}
                </p>
              ) : null}
              {channel.warnings.length > 0 ? (
                <ul className="mb-2 list-inside list-disc text-xs text-warning">
                  {channel.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <pre className="max-h-60 overflow-auto rounded-md bg-surface-2 p-3 text-xs text-text-secondary">
                {JSON.stringify(channel.payloadPreview ?? channel.exportPackPreview, null, 2)}
              </pre>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
