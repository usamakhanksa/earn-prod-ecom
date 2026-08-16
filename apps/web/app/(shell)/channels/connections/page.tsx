'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ConnectionSummary, ConnectorDefinitionSummary, ConnectorCapabilities, CredentialKind } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * Channels → Connections (prompt.md Phase 3 tasks 3.2/3.3/3.9 — the
 * connection wizard). Real backend: `GET /connectors` for the picker (only
 * ever returns connectors with `canAutomate: true` that are not quarantined
 * — Tier C/D never reach this list, brb.md §6's hard rule enforced server-side
 * already), `POST /connections` for API_KEY/PAT, `GET /connections/:id/oauth/start`
 * for OAuth2. Sync Queue / Export Packs (same nav group) stay on the
 * "coming soon" catch-all — Publishing is Phase 4 scope.
 */
export default function ConnectionsPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [connectors, setConnectors] = useState<ConnectorDefinitionSummary[] | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const [connectorList, connectionList] = await Promise.all([
        client.get<ConnectorDefinitionSummary[]>('/connectors'),
        client.get<ConnectionSummary[]>('/connections'),
      ]);
      setConnectors(connectorList);
      setConnections(connectionList);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDisconnect(connection: ConnectionSummary): Promise<void> {
    if (!window.confirm(t('channels.connections.disconnectConfirm'))) return;
    const purge = window.confirm(t('channels.connections.disconnectPurgePrompt'));
    await client.delete(`/connections/${connection.id}`, { retention: purge ? 'PURGE' : 'KEEP_ORPHAN' });
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('channels.connections.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('channels.connections.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setWizardOpen(true)}>
          {t('channels.connections.newButton')}
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

      {wizardOpen && connectors !== null ? (
        <ConnectionWizard
          connectors={connectors}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            void load();
          }}
        />
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {connections === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : connections.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('channels.connections.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.label')}</th>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.connector')}</th>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.status')}</th>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.account')}</th>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.secret')}</th>
                <th className="px-4 py-2 text-start">{t('channels.connections.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => (
                <tr key={connection.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">
                    <Link href={`/channels/connections/${connection.id}`} className="font-medium text-brand-600 hover:underline">
                      {connection.label}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{connection.connectorSlug}</td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(connection.status)}>{t(`channels.connections.status.${connection.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{connection.externalAccountLabel ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-secondary">{connection.maskedHint ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => void handleDisconnect(connection)}>
                      {t('channels.connections.disconnect')}
                    </Button>
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

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CONNECTED') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'ERROR') return 'danger';
  return 'neutral';
}

interface WizardProps {
  connectors: ConnectorDefinitionSummary[];
  onClose: () => void;
  onCreated: () => void;
}

/** The wizard itself — pick platform → auth method → credentials/OAuth →
 * scope confirm → test call → save (prompt.md Phase 3 task 3.9 / featureslist.md
 * 4.1), all against the real endpoints wired above. */
function ConnectionWizard({ connectors, onClose, onCreated }: WizardProps): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [selectedSlug, setSelectedSlug] = useState<string>(connectors[0]?.slug ?? '');
  const [label, setLabel] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [credentialValue, setCredentialValue] = useState('');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = connectors.find((c) => c.slug === selectedSlug) ?? null;
  const capabilities = selected?.capabilities as ConnectorCapabilities | undefined;
  const isOAuth = selected?.authType === 'OAUTH2' || selected?.authType === 'OAUTH2_PKCE';

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (selected === null || label.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await client.post<{ id: string; status: string }>(
        '/connections',
        {
          connectorSlug: selected.slug,
          label: label.trim(),
          sandbox,
          ...(isOAuth
            ? {}
            : {
                credential: {
                  kind: (selected.authType as CredentialKind) ?? 'API_KEY',
                  value: credentialValue,
                  ...(secondaryValue.length > 0 ? { secondaryValue } : {}),
                },
              }),
        },
        crypto.randomUUID(),
      );

      if (isOAuth) {
        const { authUrl } = await client.get<{ authUrl: string }>(`/connections/${created.id}/oauth/start`);
        window.location.href = authUrl; // full-page redirect — see ConnectorOAuthCallbackController's doc comment
        return;
      }
      onCreated();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connection-wizard-title"
      className="rounded-lg border border-border-subtle bg-surface-1 p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="connection-wizard-title" className="text-lg font-semibold text-text-primary">
          {t('channels.wizard.title')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-text-secondary hover:text-text-primary">
          ✕
        </button>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('channels.wizard.stepPick')}</span>
          <select
            value={selectedSlug}
            onChange={(event) => setSelectedSlug(event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          >
            {connectors.map((connector) => (
              <option key={connector.slug} value={connector.slug}>
                {connector.name} ({connector.tier})
              </option>
            ))}
          </select>
        </label>

        {selected !== null ? (
          <div className="rounded-md border border-border-subtle bg-surface-0 p-3 text-xs text-text-secondary">
            <p className="mb-1 font-medium text-text-primary">{t('channels.wizard.stepScopes')}</p>
            <ul className="grid grid-cols-2 gap-1">
              {capabilities !== undefined
                ? Object.entries(capabilities)
                    .filter(([key]) => key.startsWith('can'))
                    .map(([key, value]) => (
                      <li key={key} className="flex items-center gap-1">
                        <span aria-hidden="true">{value === true ? '✓' : '✗'}</span>
                        <span>{t(`channels.matrix.capability.${key}`)}</span>
                      </li>
                    ))
                : null}
            </ul>
            {selected.apiDocsUrl !== null ? (
              <a href={selected.apiDocsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-brand-600 hover:underline">
                {t('channels.wizard.viewDocs')}
              </a>
            ) : null}
          </div>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text-primary">{t('channels.wizard.labelField')}</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            required
            placeholder={t('channels.wizard.labelPlaceholder')}
            className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={sandbox} onChange={(event) => setSandbox(event.target.checked)} />
          {t('channels.wizard.sandboxToggle')}
        </label>

        {isOAuth ? (
          <p className="rounded-md border border-border-subtle bg-surface-0 p-3 text-sm text-text-secondary">{t('channels.wizard.oauthNotice')}</p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-text-primary">{t('channels.wizard.credentialField')}</span>
              <input
                type="password"
                value={credentialValue}
                onChange={(event) => setCredentialValue(event.target.value)}
                required
                autoComplete="off"
                placeholder="sk_live_..."
                className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            {selected?.slug === 'prodigi' ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-text-primary">{t('channels.wizard.secondaryCredentialField')}</span>
                <input
                  type="password"
                  value={secondaryValue}
                  onChange={(event) => setSecondaryValue(event.target.value)}
                  autoComplete="off"
                  className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
                />
              </label>
            ) : null}
          </>
        )}

        {error !== null ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {isOAuth ? t('channels.wizard.connectOAuth') : t('channels.wizard.testAndSave')}
          </Button>
        </div>
      </form>
    </div>
  );
}
