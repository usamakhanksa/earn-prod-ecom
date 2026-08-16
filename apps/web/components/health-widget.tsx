'use client';

import { useEffect, useState } from 'react';

interface HealthState {
  loading: boolean;
  status: 'ok' | 'error';
  detail: string;
}

function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ loading: true, status: 'ok', detail: '' });

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    let cancelled = false;
    fetch(`${apiUrl}/v1/readyz`)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ loading: false, status: 'error', detail: `HTTP ${res.status}` });
          return;
        }
        return res.json();
      })
      .then((body: { checks?: Record<string, string> } | undefined) => {
        if (cancelled || body === undefined || body.checks === undefined) return;
        const db = body.checks.database ?? 'unknown';
        setState({
          loading: false,
          status: db === 'ok' ? 'ok' : 'error',
          detail: `database: ${db}`,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, status: 'error', detail: 'API unreachable' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function HealthWidget({ loadingLabel }: { loadingLabel: string }) {
  const health = useHealth();

  if (health.loading) {
    return (
      <span role="status" className="text-xs text-text-secondary">
        {loadingLabel}
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
        health.status === 'ok'
          ? 'border-success/20 bg-success/10 text-success'
          : 'border-danger/20 bg-danger/10 text-danger',
      ].join(' ')}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {health.detail}
    </span>
  );
}