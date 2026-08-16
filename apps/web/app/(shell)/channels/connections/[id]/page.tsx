'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { ConnectionHealthView, ConnectionSummary, TestConnectionResult } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/** Connection detail — test/rotate/disconnect + an embedded health snapshot.
 * Also the OAuth callback's landing page (`?oauth=success|error&message=...`,
 * set by `ConnectorOAuthCallbackController`). */
export default function ConnectionDetailPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const oauthResult = searchParams.get('oauth');
  const oauthMessage = searchParams.get('message');

  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null);
  const [health, setHealth] = useState<ConnectionHealthView | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [list, healthView] = await Promise.all([
        client.get<ConnectionSummary[]>('/connections'),
        client.get<ConnectionHealthView>(`/connections/${params.id}/health`),
      ]);
      setConnections(list);
      setHealth(healthView);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, params.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const connection = connections?.find((c) => c.id === params.id) ?? null;

  async function handleTest(): Promise<void> {
    setBusy(true);
    try {
      const result = await client.post<TestConnectionResult>(`/connections/${params.id}/test`, {});
      setTestResult(result);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRotate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (rotateValue.trim().length === 0) return;
    setBusy(true);
    try {
      await client.post(`/connections/${params.id}/rotate`, { value: rotateValue.trim() }, crypto.randomUUID());
      setRotateValue('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        <p>{loadError}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (connection === null) {
    return (
      <div className="max-w-2xl">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-2 h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {oauthResult === 'success' ? (
        <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
          {t('channels.connections.oauthSuccess')}
        </p>
      ) : null}
      {oauthResult === 'error' ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {oauthMessage ?? t('channels.connections.oauthError')}
        </p>
      ) : null}

      <header>
        <h1 className="text-2xl font-bold text-text-primary">{connection.label}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {connection.connectorSlug} · <Badge tone={connection.status === 'CONNECTED' ? 'success' : connection.status === 'ERROR' ? 'danger' : 'neutral'}>{t(`channels.connections.status.${connection.status}`)}</Badge>
        </p>
      </header>

      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('channels.health.title')}</h2>
        {health === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label={t('channels.health.lastSuccess')} value={health.lastSuccessAt !== null ? new Date(health.lastSuccessAt).toLocaleString(locale) : '—'} />
            <Stat label={t('channels.health.errorRate')} value={`${health.errorRatePct}%`} />
            <Stat label={t('channels.health.avgLatency')} value={health.avgLatencyMs !== null ? `${health.avgLatencyMs}ms` : '—'} />
            <Stat
              label={t('channels.health.tokenExpiry')}
              value={health.tokenExpiresInSeconds !== null ? t('channels.health.expiresInSeconds', { seconds: health.tokenExpiresInSeconds }) : '—'}
            />
            {health.isSeedData ? (
              <p className="col-span-full text-xs italic text-text-secondary">{t('channels.health.seedDataNotice')}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={busy} onClick={() => void handleTest()}>
          {t('channels.connections.testNow')}
        </Button>
        {testResult !== null ? (
          <span className={testResult.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
            {testResult.message}
          </span>
        ) : null}
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('channels.connections.rotateTitle')}</h2>
        <form onSubmit={(event) => void handleRotate(event)} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('channels.connections.rotateField')}</span>
            <input
              type="password"
              value={rotateValue}
              onChange={(event) => setRotateValue(event.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <Button type="submit" variant="secondary" loading={busy}>
            {t('channels.connections.rotateButton')}
          </Button>
        </form>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
