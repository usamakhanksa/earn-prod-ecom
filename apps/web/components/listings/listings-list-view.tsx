'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createTranslator } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { BulkActionType, ListingSummary } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/use-locale';

export interface ListingsListViewProps {
  /** A single real status, or the "REJECTED_OR_ERROR" combined view — task
   * description: "Rejected-Errors list views". */
  status?: 'DRAFT' | 'PENDING' | 'QUEUED' | 'LIVE';
  view?: 'REJECTED_OR_ERROR' | 'SCHEDULED';
  titleKey: string;
  subtitleKey: string;
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'LIVE') return 'success';
  if (status === 'QUEUED' || status === 'PENDING') return 'warning';
  if (status === 'ERROR' || status === 'REJECTED') return 'danger';
  return 'neutral';
}

export function ListingsListView({ status, view, titleKey, subtitleKey }: ListingsListViewProps): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [listings, setListings] = useState<ListingSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BulkActionType | null>(null);

  const load = useCallback(async () => {
    if (currentTenantId === null) return;
    setLoadError(null);
    try {
      const query: Record<string, string> = {};
      if (status !== undefined) query.status = status;
      if (view !== undefined) query.view = view;
      const result = await client.get<{ items: ListingSummary[]; nextCursor: string | null }>('/listings', query);
      setListings(result.items);
      setSelected(new Set());
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, status, view, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleAll(): void {
    if (listings === null) return;
    setSelected(selected.size === listings.length ? new Set() : new Set(listings.map((l) => l.id)));
  }

  function toggleOne(id: string): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function runBulk(action: BulkActionType): Promise<void> {
    if (selected.size === 0) return;
    if (action === 'DELETE' && !window.confirm(t('listings.bulk.confirmDelete', { count: selected.size }))) return;
    setActionError(null);
    setBusyAction(action);
    try {
      await client.post('/listings:bulk', { action, listingIds: [...selected] }, crypto.randomUUID());
      await load();
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setBusyAction(null);
    }
  }

  async function retryOne(id: string): Promise<void> {
    try {
      await client.post(`/listings/${id}/retry`, {}, crypto.randomUUID());
      await load();
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t(titleKey)}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t(subtitleKey)}</p>
        </div>
        <Link href="/listings/new">
          <Button variant="primary">{t('listings.newButton')}</Button>
        </Link>
      </header>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      {actionError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {actionError}
        </div>
      ) : null}

      {selected.size > 0 ? (
        // REPRICE/RETAG need an extra value (a price or a tag list) and get
        // their own small forms in the listing detail view's bulk-adjacent
        // actions instead of a one-click button here — this toolbar covers
        // the four bulk actions that need no additional input.
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 p-3" role="toolbar" aria-label={t('listings.bulk.toolbarLabel')}>
          <span className="text-sm font-medium text-text-primary">{t('listings.bulk.selectedCount', { count: selected.size })}</span>
          {(['PUBLISH', 'UNPUBLISH', 'RESYNC', 'DELETE'] as BulkActionType[]).map((action) => (
            <Button key={action} variant="secondary" size="sm" loading={busyAction === action} onClick={() => void runBulk(action)}>
              {t(`listings.bulk.action.${action}`)}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        {listings === null ? (
          <div className="p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ) : listings.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{t('listings.empty')}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">
                  <input
                    type="checkbox"
                    aria-label={t('listings.table.selectAll')}
                    checked={selected.size === listings.length}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col" className="px-4 py-2 text-start">{t('listings.table.title')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('listings.table.channel')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('listings.table.status')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('listings.table.approval')}</th>
                <th scope="col" className="px-4 py-2 text-start">{t('listings.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label={t('listings.table.selectRow', { title: listing.title })}
                      checked={selected.has(listing.id)}
                      onChange={() => toggleOne(listing.id)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/listings/${listing.id}`} className="font-medium text-brand-600 hover:underline">
                      {listing.title}
                    </Link>
                    <div className="text-xs text-text-secondary">{listing.productName}</div>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {listing.connectionLabel}
                    {listing.isExportPackChannel ? <span className="ms-1 text-xs">({t('listings.table.exportPackBadge')})</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(listing.status)}>{t(`listings.status.${listing.status}`)}</Badge>
                    {listing.lastError !== null ? <div className="mt-1 max-w-xs text-xs text-danger">{listing.lastError}</div> : null}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={listing.approvalStatus === 'APPROVED' ? 'success' : listing.approvalStatus === 'REJECTED' ? 'danger' : 'neutral'}>
                      {t(`listings.approval.${listing.approvalStatus}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {listing.status === 'ERROR' ? (
                      <Button variant="ghost" size="sm" onClick={() => void retryOne(listing.id)}>
                        {t('listings.table.retry')}
                      </Button>
                    ) : null}
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
