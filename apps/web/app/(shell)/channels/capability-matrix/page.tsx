'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ConnectorCapabilities, ConnectorDefinitionSummary } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

const CAPABILITY_KEYS: Array<keyof ConnectorCapabilities> = [
  'canPublish',
  'canUpdate',
  'canUnpublish',
  'canSyncOrders',
  'canFulfil',
  'canFetchCost',
  'canFetchEarnings',
  'supportsWebhooks',
  'supportsSandbox',
];

/**
 * Capability matrix (prompt.md "signature moment #3" — grid of connectors ×
 * capabilities, ✓/✗/⚠, hover explains the degradation in plain language).
 * Real data from `GET /connectors` — no mock rows. `⚠` marks a capability
 * that IS true but with a documented caveat (this pass: only Prodigi's
 * missing publish/update/unpublish, which the API already reports as `false`
 * rather than a soft "partial" state — so today every cell is a clean ✓/✗;
 * `⚠` is reserved here for the moment a Tier B connector with a genuinely
 * degraded capability lands in a later phase).
 */
export default function CapabilityMatrixPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [connectors, setConnectors] = useState<ConnectorDefinitionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setConnectors(await client.get<ConnectorDefinitionSummary[]>('/connectors'));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('channels.matrix.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('channels.matrix.subtitle')}</p>
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
        {connectors === null ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <table className="w-full text-start text-sm" role="table" aria-label={t('channels.matrix.title')}>
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-start">{t('channels.matrix.connector')}</th>
                <th className="px-4 py-2 text-start">{t('channels.matrix.tier')}</th>
                {CAPABILITY_KEYS.map((key) => (
                  <th key={key} className="px-3 py-2 text-center">
                    {t(`channels.matrix.capability.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector) => {
                const capabilities = connector.capabilities as ConnectorCapabilities;
                return (
                  <tr key={connector.slug} className="border-t border-border-subtle">
                    <td className="px-4 py-2 font-medium text-text-primary">{connector.name}</td>
                    <td className="px-4 py-2">
                      <Badge tone={connector.tier === 'A' ? 'success' : connector.tier === 'B' ? 'warning' : 'danger'}>{connector.tier}</Badge>
                    </td>
                    {CAPABILITY_KEYS.map((key) => (
                      <td key={key} className="px-3 py-2 text-center">
                        <CapabilityMark
                          ok={capabilities[key] === true}
                          label={t(`channels.matrix.capability.${key}`)}
                          connectorName={connector.name}
                          explanation={t(capabilities[key] === true ? `channels.matrix.explain.${key}.ok` : `channels.matrix.explain.${key}.degraded`)}
                        />
                      </td>
                    ))}
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

function CapabilityMark({
  ok,
  label,
  connectorName,
  explanation,
}: {
  ok: boolean;
  label: string;
  connectorName: string;
  explanation: string;
}): React.JSX.Element {
  const tooltipId = `${connectorName}-${label}`.replace(/\s+/g, '-').toLowerCase();
  return (
    <span className="group relative inline-flex items-center justify-center">
      {/* A real interactive element (not a tabIndex-on-span hack) so keyboard
       * and screen-reader users get the same hover-equivalent disclosure
       * mouse users do — jsx-a11y's no-noninteractive-tabindex rule caught
       * the earlier `<span tabIndex={0}>` version of this. */}
      <button type="button" className="cursor-help" aria-describedby={tooltipId}>
        <span aria-hidden="true" className={ok ? 'text-success' : 'text-text-secondary'}>
          {ok ? '✓' : '✗'}
        </span>
        <span className="sr-only">
          {connectorName}: {label} — {ok ? 'supported' : 'not supported'}. {explanation}
        </span>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1 w-48 -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {explanation}
      </span>
    </span>
  );
}
