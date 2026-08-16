import { Injectable, NotFoundException } from '@nestjs/common';
import { getAdapter } from '@omnisell/connectors';
import type { DriftCheckResult } from '@omnisell/shared';
import { ListingRepository } from '../../repositories/listing.repository';
import { ListingVariantRepository } from '../../repositories/listing-variant.repository';
import { ListingEventRepository } from '../../repositories/listing-event.repository';
import { AdapterRunnerService } from '../../connections/adapter-runner.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { computeDrift } from './drift.engine';

/**
 * Drift detection (implentationplanphase.md task 4.13) — channel state vs.
 * local state, with resolve/force-push actions. Polls via
 * `adapter.fetchListingState` (this phase's SDK addition — see the doc
 * comment on that optional method) exactly like the task instruction points
 * at "poll via adapter.pullOrders/equivalent". Honest gap (docs/DEBT.md):
 * NONE of the four Phase 3 adapters implement `fetchListingState` yet — no
 * live-doc-confirmed single-listing "get" endpoint was verified this pass —
 * so `check()` returns a real, non-fabricated `{ supported: false }` result
 * for every connector today. The comparison logic itself
 * (`drift.engine.ts`) is fully real and tested against fixtures.
 */
@Injectable()
export class DriftDetectionService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly listingVariants: ListingVariantRepository,
    private readonly listingEvents: ListingEventRepository,
    private readonly adapterRunner: AdapterRunnerService,
    private readonly audit: AuditLogService,
  ) {}

  async check(tenantId: string, listingId: string): Promise<DriftCheckResult> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    const checkedAt = new Date().toISOString();
    const adapter = getAdapter(listing.connectorSlug);
    if (adapter?.fetchListingState === undefined || listing.externalListingId === null) {
      return { supported: false, hasDrift: false, diffs: [], checkedAt };
    }

    const variants = await this.listingVariants.listForListing(tenantId, listingId);
    const primaryPrice = variants[0]?.priceMinor ?? 0n;
    const primaryCurrency = variants[0]?.currency ?? 'USD';

    const remote = await this.adapterRunner.run(tenantId, listing.connectionId, (resolvedAdapter, ctx) => resolvedAdapter.fetchListingState!(ctx, listing.externalListingId as string));
    if (remote === null) {
      return { supported: true, hasDrift: true, diffs: [{ field: 'status', local: listing.status, remote: 'NOT_FOUND_ON_CHANNEL' }], checkedAt };
    }

    const diffs = computeDrift(
      { title: listing.title, description: listing.description, tags: listing.tags, priceMinor: primaryPrice, currency: primaryCurrency, status: listing.status },
      remote,
    );
    return { supported: true, hasDrift: diffs.length > 0, diffs, checkedAt };
  }

  /** "Resolve" — accept the CHANNEL's version as truth, overwrite local
   * fields to match. Only meaningful once `check()` can return real data
   * (see the class doc comment's honest gap). */
  async resolve(tenantId: string, userId: string, listingId: string): Promise<void> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    const adapter = getAdapter(listing.connectorSlug);
    if (adapter?.fetchListingState === undefined || listing.externalListingId === null) {
      throw new NotFoundException('This connector does not support fetching live listing state yet');
    }
    const remote = await this.adapterRunner.run(tenantId, listing.connectionId, (resolvedAdapter, ctx) => resolvedAdapter.fetchListingState!(ctx, listing.externalListingId as string));
    if (remote === null) {
      throw new NotFoundException('Listing no longer exists on the channel');
    }
    await this.listings.update(tenantId, listingId, { title: remote.title, description: remote.description, tags: remote.tags });
    await this.listingEvents.record({ tenantId, listingId, type: 'DRIFT_RESOLVED', message: 'Local listing updated to match the channel', actorId: userId });
    await this.audit.record({ tenantId, actorId: userId, action: 'listing.drift_resolved', entityType: 'Listing', entityId: listingId, after: { source: 'channel' } });
  }

  /** "Force-push" — mark the listing for re-publish so the ORCHESTRATOR
   * pushes OmniSell's local state back to the channel (real re-queue, not a
   * direct write here — publishing is the orchestrator's job, not this
   * service's). Callers should follow this with `PublishOrchestratorService
   * .retryListing`. */
  async markForForcePush(tenantId: string, userId: string, listingId: string): Promise<void> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    await this.listingEvents.record({ tenantId, listingId, type: 'DRIFT_DETECTED', message: 'Force-push requested — local state will be re-sent to the channel', actorId: userId });
    await this.audit.record({ tenantId, actorId: userId, action: 'listing.force_push_requested', entityType: 'Listing', entityId: listingId });
  }
}
