'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { DigitalProductView } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/** Digital products: file/version tree management (featureslist.md 7.1,
 * task 5.10). */
export function DigitalFilesView(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [products, setProducts] = useState<DigitalProductView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const result = await client.get<DigitalProductView[]>('/digital-products');
      setProducts(result);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProduct(): Promise<void> {
    const name = window.prompt(t('digital.files.namePrompt'));
    if (name === null || name.length === 0) return;
    setCreating(true);
    try {
      await client.post('/digital-products', { name }, crypto.randomUUID());
      await load();
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setCreating(false);
    }
  }

  async function addFile(digitalProductId: string): Promise<void> {
    const name = window.prompt(t('digital.files.filePrompt'));
    if (name === null || name.length === 0) return;
    await client.post(`/digital-products/${digitalProductId}/files`, { name }, crypto.randomUUID());
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('digital.files.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('digital.files.subtitle')}</p>
        </div>
        <Button variant="primary" loading={creating} onClick={() => void createProduct()}>
          {t('digital.files.newButton')}
        </Button>
      </header>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      {products === null ? (
        <Skeleton className="h-32 w-full" />
      ) : products.length === 0 ? (
        <p className="text-sm text-text-secondary">{t('digital.files.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {products.map((product) => (
            <li key={product.id} className="rounded-lg border border-border-subtle p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">{product.name}</h2>
                <Badge tone={product.isActive ? 'success' : 'neutral'}>{product.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {product.files.map((file) => (
                  <div key={file.id} className="rounded-md bg-surface-2 p-2 text-sm">
                    <span className="font-medium">{file.name}</span>
                    <span className="ms-2 text-text-secondary">
                      {t('digital.files.versions')}: {file.versions.length}
                    </span>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => void addFile(product.id)}>
                  {t('digital.files.addFile')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
