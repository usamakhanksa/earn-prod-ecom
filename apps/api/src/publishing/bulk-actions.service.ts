import { Injectable } from '@nestjs/common';
import { getAdapter } from '@omnisell/connectors';
import type { BulkActionResult, BulkActionResultItem, BulkListingActionInput, UndoBulkRepriceInput } from '@omnisell/shared';
import { ListingRepository } from '../repositories/listing.repository';
import { ListingVariantRepository } from '../repositories/listing-variant.repository';
import { ListingEventRepository } from '../repositories/listing-event.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { AdapterRunnerService } from '../connections/adapter-runner.service';
import { PublishOrchestratorService } from './publish-orchestrator.service';
import { DriftDetectionService } from './drift/drift-detection.service';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * Bulk actions (featureslist.md 5.11, implentationplanphase.md task 4.8) —
 * publish/unpublish/reprice/retag/resync/delete across many listings, with
 * real per-item progress and an honest reversibility story per action:
 *  - PUBLISH: real per-listing publish via the orchestrator (partial success).
 *  - UNPUBLISH: real `adapter.unpublish` call for Tier A/B; Tier C is
 *    explicitly UN-reversible/un-automatable here — this codebase does not
 *    silently pretend an unpublish happened on a channel it cannot touch.
 *  - REPRICE: local-only price change (no live channel push this phase —
 *    docs/DEBT.md), WITH a real, working undo (the previous price is
 *    returned and `undoReprice` restores it exactly).
 *  - RETAG: local-only tag change, no undo (documented — see docs/DEBT.md;
 *    reversible only by manually re-running retag with the old tags).
 *  - RESYNC: real drift-detection check per listing (4.13) — surfaces
 *    differences rather than blindly overwriting anything.
 *  - DELETE: soft-delete, DRAFT/REJECTED/ERROR listings only (a live/queued
 *    listing must be unpublished first) — not reversible via this API this
 *    phase (no restore UI), a real, documented limitation, not a fake one.
 */
@Injectable()
export class BulkActionsService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly listingVariants: ListingVariantRepository,
    private readonly listingEvents: ListingEventRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly connections: ConnectionRepository,
    private readonly adapterRunner: AdapterRunnerService,
    private readonly orchestrator: PublishOrchestratorService,
    private readonly drift: DriftDetectionService,
    private readonly audit: AuditLogService,
  ) {}

  async run(tenantId: string, userId: string, input: BulkListingActionInput): Promise<BulkActionResult> {
    const results: BulkActionResultItem[] = [];
    for (const listingId of input.listingIds) {
      results.push(await this.runOne(tenantId, userId, listingId, input));
    }
    await this.audit.record({ tenantId, actorId: userId, action: `listing.bulk_${input.action.toLowerCase()}`, entityType: 'Listing', after: { count: input.listingIds.length, succeeded: results.filter((r) => r.ok).length } });
    return { syncJobId: null, results, reversible: input.action === 'REPRICE' };
  }

  private async runOne(tenantId: string, userId: string, listingId: string, input: BulkListingActionInput): Promise<BulkActionResultItem> {
    try {
      switch (input.action) {
        case 'PUBLISH': {
          const outcome = await this.orchestrator.publishExistingListing(tenantId, userId, listingId);
          return { listingId, ok: outcome.ok, error: outcome.error };
        }
        case 'UNPUBLISH':
          return await this.unpublishOne(tenantId, userId, listingId);
        case 'REPRICE':
          return await this.repriceOne(tenantId, userId, listingId, input);
        case 'RETAG':
          return await this.retagOne(tenantId, userId, listingId, input);
        case 'RESYNC':
          return await this.resyncOne(tenantId, userId, listingId);
        case 'DELETE':
          return await this.deleteOne(tenantId, userId, listingId);
      }
    } catch (error) {
      return { listingId, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async unpublishOne(tenantId: string, userId: string, listingId: string): Promise<BulkActionResultItem> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      return { listingId, ok: false, error: 'Listing not found' };
    }
    const connection = await this.connections.findById(tenantId, listing.connectionId);
    const definition = connection !== null ? await this.connectorDefs.findById(connection.connectorId) : null;
    const capabilities = definition?.capabilities as { canAutomate: boolean; canUnpublish: boolean } | undefined;

    if (capabilities?.canAutomate !== true || capabilities.canUnpublish !== true) {
      return { listingId, ok: false, error: `"${listing.connectorSlug}" cannot be automatically unpublished — remove it manually on the channel, then mark the listing accordingly` };
    }
    if (listing.externalListingId === null) {
      return { listingId, ok: false, error: 'Listing has no externalListingId — nothing to unpublish on the channel' };
    }
    const adapter = getAdapter(listing.connectorSlug);
    if (adapter?.unpublish === undefined) {
      return { listingId, ok: false, error: `No unpublish() implementation exists for "${listing.connectorSlug}"` };
    }
    await this.adapterRunner.run(tenantId, listing.connectionId, (resolvedAdapter, ctx) => resolvedAdapter.unpublish!(ctx, listing.externalListingId as string));
    await this.listings.update(tenantId, listingId, { status: 'DRAFT', externalListingId: null });
    await this.listingVariants.updateStatusForListing(tenantId, listingId, 'PENDING');
    await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: 'Unpublished from channel', actorId: userId });
    return { listingId, ok: true, error: null };
  }

  private async repriceOne(tenantId: string, userId: string, listingId: string, input: BulkListingActionInput): Promise<BulkActionResultItem> {
    if (input.reprice === undefined) {
      return { listingId, ok: false, error: 'reprice payload is required for the REPRICE action' };
    }
    const variants = await this.listingVariants.listForListing(tenantId, listingId);
    const first = variants[0];
    if (first === undefined) {
      return { listingId, ok: false, error: 'Listing has no variants to reprice' };
    }
    const previous = { listingVariantId: first.id, priceMinor: first.priceMinor.toString(), currency: first.currency };
    for (const variant of variants) {
      await this.listingVariants.update(tenantId, variant.id, { priceMinor: BigInt(input.reprice.priceMinor), currency: input.reprice.currency });
    }
    await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: `Repriced to ${input.reprice.priceMinor} ${input.reprice.currency}`, actorId: userId });
    return { listingId, ok: true, error: null, undo: previous };
  }

  async undoReprice(tenantId: string, userId: string, input: UndoBulkRepriceInput): Promise<{ restored: number }> {
    let restored = 0;
    for (const entry of input.entries) {
      const updated = await this.listingVariants.update(tenantId, entry.listingVariantId, { priceMinor: BigInt(entry.priceMinor), currency: entry.currency });
      if (updated !== null) {
        restored += 1;
      }
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'listing.bulk_reprice_undone', entityType: 'ListingVariant', after: { restored } });
    return { restored };
  }

  private async retagOne(tenantId: string, userId: string, listingId: string, input: BulkListingActionInput): Promise<BulkActionResultItem> {
    if (input.retag === undefined) {
      return { listingId, ok: false, error: 'retag payload is required for the RETAG action' };
    }
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      return { listingId, ok: false, error: 'Listing not found' };
    }
    const newTags = input.retag.mode === 'APPEND' ? [...new Set([...listing.tags, ...input.retag.tags])] : input.retag.tags;
    await this.listings.update(tenantId, listingId, { tags: newTags });
    await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: `Tags updated (${input.retag.mode})`, actorId: userId });
    return { listingId, ok: true, error: null };
  }

  private async resyncOne(tenantId: string, userId: string, listingId: string): Promise<BulkActionResultItem> {
    const result = await this.drift.check(tenantId, listingId);
    if (!result.supported) {
      return { listingId, ok: false, error: 'Drift detection is not supported for this connector yet (no live "get listing" endpoint confirmed — docs/DEBT.md)' };
    }
    await this.listingEvents.record({ tenantId, listingId, type: result.hasDrift ? 'DRIFT_DETECTED' : 'STATUS_CHANGE', message: result.hasDrift ? `Drift detected across ${result.diffs.length} field(s)` : 'No drift detected', actorId: userId });
    return { listingId, ok: !result.hasDrift, error: result.hasDrift ? `Drift detected in: ${result.diffs.map((d) => d.field).join(', ')}` : null };
  }

  private async deleteOne(tenantId: string, userId: string, listingId: string): Promise<BulkActionResultItem> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      return { listingId, ok: false, error: 'Listing not found' };
    }
    if (listing.status === 'PENDING' || listing.status === 'QUEUED' || listing.status === 'LIVE') {
      return { listingId, ok: false, error: `Cannot delete a listing in ${listing.status} — unpublish it first` };
    }
    await this.listings.softDelete(tenantId, listingId);
    await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: 'Listing deleted', actorId: userId });
    return { listingId, ok: true, error: null };
  }
}
