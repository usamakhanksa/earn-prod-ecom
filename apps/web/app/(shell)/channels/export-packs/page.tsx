'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ExportPackView } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * Channels -> Export Packs (implentationplanphase.md task 4.12,
 * README.md §4) — the Tier C deliverable's UI: download the generated ZIP,
 * then confirm manual upload so the listing's state/analytics behave like
 * an automated channel's (README.md §4's promise).
 */
export default function ExportPacksPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [packs, setPacks] = useState<ExportPackView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      setPacks(await client.get<ExportPackView[]>('/export-packs'));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownload(pack: ExportPackView): Promise<void> {
    setBusyId(pack.id);
    try {
      const { blob, fileName } = await client.downloadBlob(`/export-packs/${pack.id}/download`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName ?? pack.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function handleConfirm(pack: ExportPackView): Promise<void> {
    if (!window.confirm(t('channels.exportPacks.confirmPrompt'))) return;
    setBusyId(pack.id);
    try {
      await client.post(`/export-packs/${pack.id}/confirm`, {}, crypto.randomUUID());
      await load();
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('channels.exportPacks.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('channels.exportPacks.subtitle')}</p>
      </header>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {packs === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : packs.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('channels.exportPacks.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.exportPacks.table.file')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.exportPacks.table.channel')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.exportPacks.table.status')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('channels.exportPacks.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((pack) => (
                <tr key={pack.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2 font-mono text-xs">{pack.fileName}</td>
                  <td className="px-4 py-2 text-text-secondary">{pack.connectorSlug}</td>
                  <td className="px-4 py-2">
                    <Badge tone={pack.status === 'CONFIRMED' ? 'success' : pack.status === 'DOWNLOADED' ? 'warning' : 'neutral'}>{pack.status}</Badge>
                  </td>
                  <td className="px-4 py-2 space-x-2 space-x-reverse">
                    <Button variant="ghost" size="sm" loading={busyId === pack.id} onClick={() => void handleDownload(pack)}>
                      {t('channels.exportPacks.download')}
                    </Button>
                    {pack.status !== 'CONFIRMED' ? (
                      <Button variant="ghost" size="sm" loading={busyId === pack.id} onClick={() => void handleConfirm(pack)}>
                        {t('channels.exportPacks.confirmUpload')}
                      </Button>
                    ) : (
                      <span className="text-xs text-text-secondary">{t('channels.exportPacks.confirmedAt', { date: pack.confirmedByUserAt !== null ? new Date(pack.confirmedByUserAt).toLocaleDateString(locale) : '' })}</span>
                    )}
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
