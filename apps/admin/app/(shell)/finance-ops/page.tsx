'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { Badge, Button } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

interface AdminPayoutRow {
  id: string;
  connectorSlug: string;
  currency: string;
  varianceMinor: string | null;
  varianceStatus: string;
  tenant: { name: string };
}

interface AdminDisputeRow {
  id: string;
  sourceType: string;
  sourceId: string;
  amountMinor: string;
  currency: string;
  status: string;
  reasonCode: string;
  tenant: { name: string };
}

/**
 * Admin Finance Ops (Phase 6, task 6.11) — platform-wide reconciliation
 * board (payouts flagged MAJOR_VARIANCE/DISPUTED across every tenant), the
 * disputes register, and a cross-tenant manual ledger correction form
 * (mandatory reason code). Mirrors `/order-exceptions`'s real, no-fabricated-
 * data admin pattern.
 */
export default function FinanceOpsPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useAdminSession();

  const [board, setBoard] = useState<AdminPayoutRow[] | null>(null);
  const [disputes, setDisputes] = useState<AdminDisputeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [correctionTenantId, setCorrectionTenantId] = useState('');
  const [correctionMemo, setCorrectionMemo] = useState('');
  const [correctionReason, setCorrectionReason] = useState('RECONCILIATION_ADJUSTMENT');
  const [correctionLinesJson, setCorrectionLinesJson] = useState(
    '[{"accountCode":"cash","direction":"DEBIT","amountMinor":"100","currencyCode":"USD"},{"accountCode":"sales_revenue","direction":"CREDIT","amountMinor":"100","currencyCode":"USD"}]',
  );
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [boardResult, disputesResult] = await Promise.all([
        client.get<AdminPayoutRow[]>('/admin/finance/reconciliation-board'),
        client.get<AdminDisputeRow[]>('/admin/finance/disputes', { status: 'OPEN' }),
      ]);
      setBoard(boardResult);
      setDisputes(disputesResult);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolveDispute(id: string, status: 'RESOLVED' | 'REJECTED'): Promise<void> {
    setBusy(true);
    try {
      await client.post(`/admin/finance/disputes/${id}/resolve`, { status });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function postCorrection(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setCorrectionMessage(null);
    setError(null);
    let lines: unknown;
    try {
      lines = JSON.parse(correctionLinesJson);
    } catch {
      setError('Correction lines must be valid JSON');
      return;
    }
    setBusy(true);
    try {
      await client.post(`/admin/finance/tenants/${correctionTenantId}/ledger-corrections`, { memo: correctionMemo, reasonCode: correctionReason, lines });
      setCorrectionMessage(t('admin.financeOps.correctionSuccess'));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('admin.financeOps.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('admin.financeOps.subtitle')}</p>
      </header>

      {error !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('admin.financeOps.reconciliationHeading')}</h2>
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          {board === null ? (
            <p className="p-4 text-sm text-text-secondary">{t('common.loading')}</p>
          ) : board.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">{t('admin.financeOps.reconciliationEmpty')}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start">{t('admin.financeOps.table.tenant')}</th>
                  <th scope="col" className="px-4 py-2 text-start">{t('admin.financeOps.table.channel')}</th>
                  <th scope="col" className="px-4 py-2 text-end">{t('admin.financeOps.table.variance')}</th>
                  <th scope="col" className="px-4 py-2 text-start">{t('admin.financeOps.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {board.map((row) => (
                  <tr key={row.id} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{row.tenant.name}</td>
                    <td className="px-4 py-2">{row.connectorSlug}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{row.varianceMinor ?? '—'} {row.currency}</td>
                    <td className="px-4 py-2">
                      <Badge tone="danger">{row.varianceStatus}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('admin.financeOps.disputesHeading')}</h2>
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          {disputes === null ? (
            <p className="p-4 text-sm text-text-secondary">{t('common.loading')}</p>
          ) : disputes.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">{t('admin.financeOps.disputesEmpty')}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start">{t('admin.financeOps.table.tenant')}</th>
                  <th scope="col" className="px-4 py-2 text-end">{t('finance.expenses.table.amount')}</th>
                  <th scope="col" className="px-4 py-2 text-start">{t('admin.financeOps.table.reason')}</th>
                  <th scope="col" className="px-4 py-2 text-start"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((dispute) => (
                  <tr key={dispute.id} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{dispute.tenant.name}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{dispute.amountMinor} {dispute.currency}</td>
                    <td className="px-4 py-2 font-mono text-xs">{dispute.reasonCode}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void resolveDispute(dispute.id, 'RESOLVED')}>
                          {t('admin.financeOps.resolve')}
                        </Button>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void resolveDispute(dispute.id, 'REJECTED')}>
                          {t('admin.financeOps.reject')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">{t('admin.financeOps.correctionHeading')}</h2>
        <p className="text-xs text-text-secondary">{t('admin.financeOps.correctionHint')}</p>
        <form className="space-y-3 rounded-lg border border-border-subtle p-4" onSubmit={(e) => void postCorrection(e)}>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            {t('admin.financeOps.correctionTenantIdLabel')}
            <input required value={correctionTenantId} onChange={(e) => setCorrectionTenantId(e.target.value)} className="rounded-md border border-border-subtle px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            {t('admin.financeOps.correctionMemoLabel')}
            <input required value={correctionMemo} onChange={(e) => setCorrectionMemo(e.target.value)} className="rounded-md border border-border-subtle px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            {t('admin.financeOps.correctionReasonLabel')}
            <select value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} className="rounded-md border border-border-subtle px-2 py-1 text-sm">
              <option value="DATA_ENTRY_ERROR">DATA_ENTRY_ERROR</option>
              <option value="RECONCILIATION_ADJUSTMENT">RECONCILIATION_ADJUSTMENT</option>
              <option value="AUDITOR_REQUESTED">AUDITOR_REQUESTED</option>
              <option value="PERIOD_CLOSE_TRUE_UP">PERIOD_CLOSE_TRUE_UP</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Lines (JSON)
            <textarea
              value={correctionLinesJson}
              onChange={(e) => setCorrectionLinesJson(e.target.value)}
              rows={3}
              className="rounded-md border border-border-subtle px-2 py-1 font-mono text-xs"
            />
          </label>
          {correctionMessage !== null ? <p className="text-sm text-success">{correctionMessage}</p> : null}
          <Button type="submit" variant="primary" loading={busy}>
            {t('admin.financeOps.correctionSubmit')}
          </Button>
        </form>
      </section>
    </div>
  );
}
