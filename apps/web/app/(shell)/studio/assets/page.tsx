'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type {
  AssetSummary,
  AssetVersionSummary,
  BlueprintSummary,
  PreflightReportResult,
  PrintAreaSpec,
} from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { uploadFileResumable } from '@/lib/resumable-upload';

function preflightTone(status: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'PASS') return 'success';
  if (status === 'WARN') return 'warning';
  if (status === 'FAIL') return 'danger';
  return 'neutral';
}

function ruleTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'PASS') return 'success';
  if (status === 'WARN') return 'warning';
  if (status === 'FAIL') return 'danger';
  return 'neutral';
}

export default function AssetLibraryPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<AssetVersionSummary[] | null>(null);
  const [blueprints, setBlueprints] = useState<BlueprintSummary[] | null>(null);
  const [preflightBlueprintId, setPreflightBlueprintId] = useState('');
  const [preflightPlacement, setPreflightPlacement] = useState('');
  const [preflightResult, setPreflightResult] = useState<PreflightReportResult | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const query: Record<string, string> = {};
      if (search.length > 0) query.search = search;
      if (starredOnly) query.starred = 'true';
      const page = await client.get<{ items: AssetSummary[]; nextCursor: string | null }>('/assets', query);
      setAssets(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, search, starredOnly, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (currentTenantId === null) return;
    client
      .get<BlueprintSummary[]>('/blueprints')
      .then(setBlueprints)
      .catch(() => setBlueprints([]));
  }, [client, currentTenantId]);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (files === null || files.length === 0) return;
    setUploadError(null);
    setUploadingCount(files.length);
    try {
      for (const file of Array.from(files)) {
        await uploadFileResumable(client, file);
      }
      await load();
    } catch (error) {
      setUploadError(error instanceof ApiRequestError ? error.message : t('studio.assets.uploadError'));
    } finally {
      setUploadingCount(0);
      if (fileInputRef.current !== null) fileInputRef.current.value = '';
    }
  }

  async function toggleStar(asset: AssetSummary): Promise<void> {
    await client.patch(`/assets/${asset.id}`, { starred: !asset.starred });
    await load();
  }

  async function openDetail(asset: AssetSummary): Promise<void> {
    setSelectedId(asset.id);
    setPreflightResult(null);
    setPreflightBlueprintId('');
    setPreflightPlacement('');
    try {
      const detail = await client.get<{ asset: AssetSummary; versions: AssetVersionSummary[] }>(`/assets/${asset.id}`);
      setVersions(detail.versions);
    } catch {
      setVersions([]);
    }
  }

  async function rollback(assetId: string, versionNumber: number): Promise<void> {
    if (!window.confirm(t('studio.assets.detail.rollbackConfirm'))) return;
    await client.post(`/assets/${assetId}/rollback`, { versionNumber });
    await load();
    await openDetail({ id: assetId } as AssetSummary);
  }

  async function runPreflight(assetId: string): Promise<void> {
    setPreflightBusy(true);
    try {
      const body: Record<string, string> = {};
      if (preflightBlueprintId.length > 0) body.blueprintId = preflightBlueprintId;
      if (preflightPlacement.length > 0) body.placementCode = preflightPlacement;
      const result = await client.post<PreflightReportResult>(`/assets/${assetId}/preflight`, body);
      setPreflightResult(result);
      await load();
    } catch (error) {
      setUploadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setPreflightBusy(false);
    }
  }

  const selectedAsset = assets?.find((a) => a.id === selectedId) ?? null;
  const selectedBlueprint = blueprints?.find((b) => b.id === preflightBlueprintId) ?? null;
  const printAreas: PrintAreaSpec[] = selectedBlueprint?.printAreas ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('studio.assets.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('studio.assets.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
            aria-label={t('studio.assets.uploadButton')}
          />
          <Button onClick={() => fileInputRef.current?.click()} loading={uploadingCount > 0}>
            {uploadingCount > 0 ? t('studio.assets.uploadingCount', { count: uploadingCount }) : t('studio.assets.uploadButton')}
          </Button>
        </div>
      </header>

      {uploadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {uploadError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[220px] text-sm">
          <span className="sr-only">{t('studio.assets.searchPlaceholder')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('studio.assets.searchPlaceholder')}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={starredOnly} onChange={(event) => setStarredOnly(event.target.checked)} />
          {t('studio.assets.filterStarredOnly')}
        </label>
      </div>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      {assets === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="rounded-lg border border-border-subtle p-8 text-center text-sm text-text-secondary">
          {t('studio.assets.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((asset) => (
            <div key={asset.id} className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3 shadow-sh1">
              <button
                type="button"
                onClick={() => void openDetail(asset)}
                className="flex h-24 items-center justify-center rounded-md bg-surface-1 text-3xl"
                aria-label={asset.name}
              >
                {asset.kind === 'IMAGE' ? '🖼️' : asset.kind === 'VECTOR' ? '✒️' : '📄'}
              </button>
              <div className="flex items-start justify-between gap-1">
                <p className="truncate text-xs font-medium text-text-primary" title={asset.name}>
                  {asset.name}
                </p>
                <button
                  type="button"
                  onClick={() => void toggleStar(asset)}
                  aria-label={asset.starred ? t('studio.assets.card.unstarLabel') : t('studio.assets.card.starLabel')}
                  aria-pressed={asset.starred}
                  className={asset.starred ? 'text-accent-500' : 'text-text-secondary'}
                >
                  {asset.starred ? '★' : '☆'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={asset.status === 'READY' ? 'success' : asset.status === 'FAILED' ? 'danger' : 'neutral'}>
                  {t(`studio.assets.status.${asset.status}`)}
                </Badge>
                <Badge tone={preflightTone(asset.latestPreflightStatus)}>
                  {asset.latestPreflightStatus !== null
                    ? t(`studio.assets.preflightBadge.${asset.latestPreflightStatus}`)
                    : t('studio.assets.preflightBadge.none')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedAsset !== null ? (
        <aside
          aria-label={t('studio.assets.detail.title')}
          className="fixed inset-y-0 end-0 z-20 w-full max-w-md overflow-y-auto border-s border-border-subtle bg-surface-0 p-6 shadow-sh3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">{selectedAsset.name}</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              {t('studio.assets.detail.close')}
            </Button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-text-secondary">
            <dt className="sr-only">dimensions</dt>
            <dd className="tabular-nums">
              {selectedAsset.widthPx !== null && selectedAsset.heightPx !== null
                ? t('studio.assets.detail.dimensions', { width: selectedAsset.widthPx, height: selectedAsset.heightPx })
                : '—'}
            </dd>
            <dd className="tabular-nums">
              {selectedAsset.dpi !== null ? t('studio.assets.detail.dpiLabel', { dpi: selectedAsset.dpi }) : t('studio.assets.detail.dpiUnknown')}
            </dd>
            <dd className="tabular-nums">{t('studio.assets.detail.sizeLabel', { sizeMb: Math.round((selectedAsset.sizeBytes / (1024 * 1024)) * 10) / 10 })}</dd>
          </dl>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-text-primary">{t('studio.assets.detail.preflightTitle')}</h3>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <span className="mb-1 block text-text-secondary">{t('studio.assets.detail.blueprintSelect')}</span>
                <select
                  value={preflightBlueprintId}
                  onChange={(event) => {
                    setPreflightBlueprintId(event.target.value);
                    setPreflightPlacement('');
                  }}
                  className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-text-primary"
                >
                  <option value="">{t('studio.assets.detail.blueprintNone')}</option>
                  {(blueprints ?? []).map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name}
                    </option>
                  ))}
                </select>
              </label>
              {printAreas.length > 0 ? (
                <label className="text-xs">
                  <span className="mb-1 block text-text-secondary">{t('studio.assets.detail.placementSelect')}</span>
                  <select
                    value={preflightPlacement}
                    onChange={(event) => setPreflightPlacement(event.target.value)}
                    className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-text-primary"
                  >
                    <option value="">—</option>
                    {printAreas.map((area) => (
                      <option key={area.code} value={area.code}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button size="sm" loading={preflightBusy} onClick={() => void runPreflight(selectedAsset.id)}>
                {t('studio.assets.detail.runPreflightButton')}
              </Button>
            </div>

            {preflightResult !== null ? (
              <div className="mt-3 space-y-1">
                <Badge tone={preflightTone(preflightResult.overallStatus)}>{t(`studio.preflight.overall.${preflightResult.overallStatus}`)}</Badge>
                <ul className="mt-2 space-y-1">
                  {preflightResult.rules.map((rule) => (
                    <li key={rule.rule} className="rounded-md border border-border-subtle p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-text-primary">{t(`studio.preflight.ruleName.${rule.rule}`)}</span>
                        <Badge tone={ruleTone(rule.status)}>{t(`studio.preflight.status.${rule.status}`)}</Badge>
                      </div>
                      <p className="mt-1 text-text-secondary">{t(rule.messageKey, rule.params)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-xs text-text-secondary">{t('studio.assets.detail.noPreflightYet')}</p>
            )}
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-text-primary">{t('studio.assets.detail.versionsTitle')}</h3>
            {versions === null ? (
              <Skeleton className="mt-2 h-16 w-full" />
            ) : (
              <ul className="mt-2 space-y-1">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between rounded-md border border-border-subtle p-2 text-xs">
                    <span className="text-text-primary">
                      {t('studio.assets.detail.versionRow', { version: version.versionNumber, date: new Date(version.createdAt).toLocaleDateString(locale) })}
                    </span>
                    {version.versionNumber !== selectedAsset.currentVersion ? (
                      <Button variant="ghost" size="sm" onClick={() => void rollback(selectedAsset.id, version.versionNumber)}>
                        {t('studio.assets.detail.rollbackButton')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      ) : null}
    </div>
  );
}
