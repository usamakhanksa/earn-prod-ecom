'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ConnectorCapabilities, ConnectorDefinitionSummary } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

/**
 * Connector Registry (README.md §5's "most important admin screen" —
 * featureslist.md 4.15/14.6). Real CRUD against `GET/PATCH /admin/connectors*`
 * — every row here, including quarantined Tier D ones, is genuine registry
 * data (docs/CONNECTORS.md), never a mock fixture.
 */
export default function ConnectorRegistryPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [connectors, setConnectors] = useState<ConnectorDefinitionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConnectors(await client.get<ConnectorDefinitionSummary[]>('/admin/connectors'));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleQuarantine(connector: ConnectorDefinitionSummary): Promise<void> {
    setBusySlug(connector.slug);
    try {
      await client.patch(`/admin/connectors/${connector.slug}/quarantine`, { quarantined: connector.status !== 'UNVERIFIED' });
      await load();
    } finally {
      setBusySlug(null);
    }
  }

  async function toggleSandbox(connector: ConnectorDefinitionSummary): Promise<void> {
    const capabilities = connector.capabilities as ConnectorCapabilities;
    setBusySlug(connector.slug);
    try {
      await client.patch(`/admin/connectors/${connector.slug}`, {
        capabilities: { ...capabilities, supportsSandbox: !capabilities.supportsSandbox },
      });
      await load();
    } finally {
      setBusySlug(null);
    }
  }

  async function verifyNow(connector: ConnectorDefinitionSummary): Promise<void> {
    const verifiedBy = window.prompt(t('admin.connectors.verifyPrompt'));
    if (verifiedBy === null || verifiedBy.trim().length === 0) return;
    setBusySlug(connector.slug);
    try {
      await client.patch(`/admin/connectors/${connector.slug}/verify`, { verifiedBy: verifiedBy.trim() });
      await load();
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-text-primary">{t('admin.nav.connectorRegistry')}</h1>
        <p className="mt-1 text-xs text-text-secondary">{t('admin.connectors.subtitle')}</p>
      </header>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {connectors === null ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.name')}</th>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.tier')}</th>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.status')}</th>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.auth')}</th>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.verified')}</th>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.docs')}</th>
                <th className="px-4 py-2 text-start">{t('admin.connectors.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector) => {
                const capabilities = connector.capabilities as ConnectorCapabilities;
                return (
                  <tr key={connector.slug} className="border-t border-border-subtle align-top">
                    <td className="px-4 py-2">
                      <p className="font-medium text-text-primary">{connector.name}</p>
                      <p className="font-mono text-xs text-text-secondary">{connector.slug}</p>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={connector.tier === 'A' ? 'success' : connector.tier === 'B' ? 'warning' : 'danger'}>{connector.tier}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={connector.status === 'UNVERIFIED' ? 'danger' : connector.status === 'BETA' ? 'warning' : 'success'}>
                        {connector.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{connector.authType}</td>
                    <td className="px-4 py-2 text-xs text-text-secondary">
                      {connector.verifiedAt !== null ? (
                        <>
                          <p>{new Date(connector.verifiedAt).toLocaleDateString(locale)}</p>
                          <p className="max-w-[16rem] truncate" title={connector.verifiedBy ?? ''}>
                            {connector.verifiedBy}
                          </p>
                        </>
                      ) : (
                        t('admin.connectors.neverVerified')
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {connector.apiDocsUrl !== null ? (
                        <a href={connector.apiDocsUrl} target="_blank" rel="noreferrer" className="block text-brand-600 hover:underline">
                          {t('admin.connectors.apiDocs')}
                        </a>
                      ) : null}
                      {connector.tosUrl !== null ? (
                        <a href={connector.tosUrl} target="_blank" rel="noreferrer" className="block text-brand-600 hover:underline">
                          {t('admin.connectors.tos')}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="sm" loading={busySlug === connector.slug} onClick={() => void toggleQuarantine(connector)}>
                          {connector.status === 'UNVERIFIED' ? t('admin.connectors.unquarantine') : t('admin.connectors.quarantine')}
                        </Button>
                        <Button variant="ghost" size="sm" loading={busySlug === connector.slug} onClick={() => void toggleSandbox(connector)}>
                          {capabilities.supportsSandbox ? t('admin.connectors.sandboxOn') : t('admin.connectors.sandboxOff')}
                        </Button>
                        <Button variant="ghost" size="sm" loading={busySlug === connector.slug} onClick={() => void verifyNow(connector)}>
                          {t('admin.connectors.verifyNow')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
