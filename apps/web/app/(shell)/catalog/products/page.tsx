'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ProductSummary } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';
import { formatMoneyMinor } from '@/lib/format-money';

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DRAFT') return 'warning';
  return 'neutral';
}

export default function ProductsPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const query: Record<string, string> = {};
      if (search.length > 0) query.search = search;
      const page = await client.get<{ items: ProductSummary[]; nextCursor: string | null }>('/products', query);
      setProducts(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, search, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDuplicate(product: ProductSummary): Promise<void> {
    const newSku = window.prompt(t('catalog.builder.duplicateSkuPrompt'), `${product.sku}-COPY`);
    if (newSku === null || newSku.trim().length === 0) return;
    await client.post(`/products/${product.id}/duplicate`, { newSku: newSku.trim() }, crypto.randomUUID());
    await load();
  }

  async function handleArchive(product: ProductSummary): Promise<void> {
    if (!window.confirm(t('catalog.products.archiveConfirm'))) return;
    await client.post(`/products/${product.id}/archive`, {});
    await load();
  }

  async function handleExport(): Promise<void> {
    const csv = await client.get<string>('/products/export.csv');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const csv = await file.text();
    const result = await client.post<{ createdProducts: number; upsertedVariants: number; errors: string[] }>(
      '/products/import.csv',
      { csv },
    );
    setImportSummary(
      t('catalog.products.importSummary', {
        createdProducts: result.createdProducts,
        upsertedVariants: result.upsertedVariants,
        errorCount: result.errors.length,
      }),
    );
    event.target.value = '';
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('catalog.products.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('catalog.products.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void handleExport()}>
            {t('catalog.products.exportCsv')}
          </Button>
          <label className="cursor-pointer rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-1">
            {t('catalog.products.importCsv')}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleImport(event)} />
          </label>
          <Link
            href="/catalog/products/new"
            className="inline-flex h-9 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500"
          >
            {t('catalog.products.newButton')}
          </Link>
        </div>
      </header>

      {importSummary !== null ? (
        <p role="status" className="rounded-lg border border-border-subtle bg-surface-1 p-3 text-sm text-text-secondary">
          {importSummary}
        </p>
      ) : null}

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('catalog.products.searchPlaceholder')}
        className="w-full max-w-sm rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
      />

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {products === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="mt-2 h-5 w-full" />
          </div>
        ) : products.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('catalog.products.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-start">{t('catalog.products.table.name')}</th>
                <th className="px-4 py-2 text-start">{t('catalog.products.table.sku')}</th>
                <th className="px-4 py-2 text-start">{t('catalog.products.table.status')}</th>
                <th className="px-4 py-2 text-start">{t('catalog.products.table.variants')}</th>
                <th className="px-4 py-2 text-start">{t('catalog.products.table.price')}</th>
                <th className="px-4 py-2 text-start">{t('catalog.products.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">
                    <Link href={`/catalog/products/${product.id}`} className="font-medium text-brand-600 hover:underline">
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-text-secondary">{product.sku}</td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(product.status)}>{t(`catalog.products.status.${product.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">
                    {product.enabledVariantCount}/{product.variantCount}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-text-primary">{formatMoneyMinor(product.priceMinor, product.currency, locale)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => void handleDuplicate(product)}>
                        {t('catalog.products.duplicate')}
                      </Button>
                      {product.status !== 'ARCHIVED' ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleArchive(product)}>
                          {t('catalog.products.archive')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
