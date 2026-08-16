'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { DriftCheckResult, ListingDetail } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

/**
 * Listing detail — variants, activity timeline, approval workflow with
 * comments (featureslist.md 5.10/5.13), drift detection (5.12), and the
 * Export Pack action for Tier C channels.
 */
export default function ListingDetailPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();
  const params = useParams<{ id: string }>();

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [drift, setDrift] = useState<DriftCheckResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setListing(await client.get<ListingDetail>(`/listings/${params.id}`));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, params.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy(key: string, fn: () => Promise<void>): Promise<void> {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  if (loadError !== null && listing === null) {
    return (
      <div role="alert" className="mx-auto max-w-3xl rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        {loadError}
      </div>
    );
  }
  if (listing === null) {
    return <Skeleton className="mx-auto max-w-3xl h-40 w-full" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{listing.title}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {listing.productName} → {listing.connectionLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={listing.status === 'LIVE' ? 'success' : listing.status === 'ERROR' || listing.status === 'REJECTED' ? 'danger' : 'neutral'}>
            {t(`listings.status.${listing.status}`)}
          </Badge>
          <Badge tone="neutral">{t(`listings.approval.${listing.approvalStatus}`)}</Badge>
        </div>
      </header>

      {listing.status === 'ERROR' ? (
        <Button variant="primary" loading={busy === 'retry'} onClick={() => void withBusy('retry', async () => { await client.post(`/listings/${listing.id}/retry`, {}, crypto.randomUUID()); await load(); })}>
          {t('listings.detail.retryButton')}
        </Button>
      ) : null}

      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">{t('listings.detail.variantsHeading')}</h2>
        <table className="w-full text-start text-sm">
          <thead className="text-xs uppercase text-text-secondary">
            <tr>
              <th scope="col" className="text-start">{t('listings.detail.variantSku')}</th>
              <th scope="col" className="text-start">{t('listings.detail.variantPrice')}</th>
              <th scope="col" className="text-start">{t('listings.detail.variantExternalId')}</th>
              <th scope="col" className="text-start">{t('listings.detail.variantStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {listing.variants.map((variant) => (
              <tr key={variant.id} className="border-t border-border-subtle">
                <td>{variant.sku}</td>
                <td className="tabular-nums">{(Number(variant.priceMinor) / 100).toFixed(2)} {variant.currency}</td>
                <td className="font-mono text-xs">{variant.externalId ?? '—'}</td>
                <td>
                  <Badge tone={variant.status === 'LIVE' ? 'success' : variant.status === 'ERROR' ? 'danger' : 'neutral'}>{variant.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Approval workflow (5.10) — submit/decide, both real state-machine
          transitions gated server-side by CASL (DESIGNER submits, OWNER/ADMIN
          decide — see docs/OPEN_QUESTIONS.md's MANAGER-role reconciliation). */}
      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">{t('listings.detail.approvalHeading')}</h2>
        {listing.approvalStatus === 'NONE' || listing.approvalStatus === 'REJECTED' ? (
          <Button variant="secondary" loading={busy === 'submit'} onClick={() => void withBusy('submit', async () => { await client.post(`/listings/${listing.id}/submit-for-approval`, {}); await load(); })}>
            {t('listings.detail.submitForApprovalButton')}
          </Button>
        ) : listing.approvalStatus === 'SUBMITTED' ? (
          <div className="space-y-2">
            <textarea
              value={decisionComment}
              onChange={(event) => setDecisionComment(event.target.value)}
              placeholder={t('listings.detail.decisionCommentPlaceholder')}
              rows={2}
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={busy === 'approve'}
                onClick={() => void withBusy('approve', async () => { await client.post(`/listings/${listing.id}/approval-decision`, { decision: 'APPROVED', comment: decisionComment }); setDecisionComment(''); await load(); })}
              >
                {t('listings.detail.approveButton')}
              </Button>
              <Button
                variant="secondary"
                loading={busy === 'reject'}
                onClick={() => void withBusy('reject', async () => { await client.post(`/listings/${listing.id}/approval-decision`, { decision: 'REJECTED', comment: decisionComment }); setDecisionComment(''); await load(); })}
              >
                {t('listings.detail.rejectButton')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-success">{t('listings.detail.alreadyApproved')}</p>
        )}
      </section>

      {/* Drift detection (5.12). */}
      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t('listings.detail.driftHeading')}</h2>
          <Button variant="ghost" size="sm" loading={busy === 'drift'} onClick={() => void withBusy('drift', async () => setDrift(await client.get<DriftCheckResult>(`/listings/${listing.id}/drift`)))}>
            {t('listings.detail.checkDriftButton')}
          </Button>
        </div>
        {drift !== null ? (
          !drift.supported ? (
            <p className="text-sm text-text-secondary">{t('listings.detail.driftUnsupported')}</p>
          ) : !drift.hasDrift ? (
            <p className="text-sm text-success">{t('listings.detail.driftNone')}</p>
          ) : (
            <div className="space-y-2">
              <ul className="list-inside list-disc text-sm text-warning">
                {drift.diffs.map((diff) => (
                  <li key={diff.field}>{diff.field}: {String(diff.local)} → {String(diff.remote)}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => void withBusy('resolve', async () => { await client.post(`/listings/${listing.id}/drift/resolve`, {}); await load(); setDrift(null); })}>
                  {t('listings.detail.resolveDriftButton')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void withBusy('forcePush', async () => { await client.post(`/listings/${listing.id}/drift/force-push`, {}); await load(); setDrift(null); })}>
                  {t('listings.detail.forcePushButton')}
                </Button>
              </div>
            </div>
          )
        ) : null}
      </section>

      {/* Activity timeline + comments (5.13/5.10). */}
      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">{t('listings.detail.activityHeading')}</h2>
        <ol className="space-y-2 text-sm">
          {listing.events.map((event) => (
            <li key={event.id} className="border-s-2 border-border-subtle ps-3">
              <span className="font-medium text-text-primary">{t(`listings.eventType.${event.type}`)}</span>
              <span className="ms-2 text-text-secondary">{event.message}</span>
              <div className="text-xs text-text-secondary">{new Date(event.createdAt).toLocaleString(locale)}</div>
            </li>
          ))}
        </ol>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void withBusy('comment', async () => {
              await client.post(`/listings/${listing.id}/comments`, { body: comment });
              setComment('');
              await load();
            });
          }}
        >
          <label className="sr-only" htmlFor="listing-comment-input">
            {t('listings.detail.commentPlaceholder')}
          </label>
          <input
            id="listing-comment-input"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t('listings.detail.commentPlaceholder')}
            className="flex-1 rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
          />
          <Button type="submit" variant="secondary" loading={busy === 'comment'} disabled={comment.trim().length === 0}>
            {t('listings.detail.commentButton')}
          </Button>
        </form>
      </section>
    </div>
  );
}
