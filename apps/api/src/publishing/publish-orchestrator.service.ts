import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Connector, PublishInput } from '@omnisell/connectors';
import { canAutomate, publish as sdkPublish } from '@omnisell/connectors';
import type { Locale } from '@omnisell/i18n';
import type { PolicyViolation, PublishListingInput } from '@omnisell/shared';
import { ListingsService } from './listings/listings.service';
import { ListingRepository } from '../repositories/listing.repository';
import { ListingVariantRepository } from '../repositories/listing-variant.repository';
import { ListingEventRepository } from '../repositories/listing-event.repository';
import { SyncJobRepository } from '../repositories/sync-job.repository';
import { SyncJobItemRepository } from '../repositories/sync-job-item.repository';
import { PublishInputBuilderService } from './publish-input-builder.service';
import { BannedTermsService } from './policy/banned-terms.service';
import { ExportPackGeneratorService } from './export-packs/export-pack-generator.service';
import { AdapterRunnerService } from '../connections/adapter-runner.service';
import { ConnectorQueueService, QUEUE_CONNECTOR_SLUGS, type QueueConnectorSlug } from '../queue/connector-queue.service';
import { AuditLogService } from '../audit/audit-log.service';

export interface PublishOutcome {
  syncJobId: string;
  listingIds: string[];
  results: Array<{ listingId: string; connectorSlug: string; ok: boolean; error: string | null; route: 'QUEUED_AUTOMATION' | 'EXPORT_PACK' | 'UNSUPPORTED' }>;
}

function isQueueSlug(slug: string): slug is QueueConnectorSlug {
  return (QUEUE_CONNECTOR_SLUGS as readonly string[]).includes(slug);
}

/**
 * The publish orchestrator (implentationplanphase.md task 4.5) — fans out
 * one job per (listing x channel), partial success, per-item error capture.
 *
 * THE TIER-C BOUNDARY, EXERCISED FOR REAL: for every channel this loop
 * touches, the ONLY way execution reaches `sdkPublish` (the free-standing
 * `publish()` function from `@omnisell/connectors`, prompt.md constraint #1)
 * is through the `canAutomate(connectorObj)` type-guard's `true` branch,
 * which narrows `connectorObj` from `Connector` to `AutomatableConnector` —
 * the exact same compile-time mechanism `packages/connectors/test/automation-
 * boundary.test.ts` proves in isolation. A Tier C connector's `capabilities.
 * canAutomate` is the literal `false`, so `canAutomate()` returns `false` for
 * it and TypeScript never lets `connectorObj` reach `sdkPublish` in that
 * branch — there is no `as unknown as AutomatableConnector` anywhere in this
 * file, and there must never be one. Tier C connectors are routed to
 * `ExportPackGeneratorService.generate` in the `else` branch instead — a
 * completely different function that never touches `sdkPublish`.
 */
@Injectable()
export class PublishOrchestratorService {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly listings: ListingRepository,
    private readonly listingVariants: ListingVariantRepository,
    private readonly listingEvents: ListingEventRepository,
    private readonly syncJobs: SyncJobRepository,
    private readonly syncJobItems: SyncJobItemRepository,
    private readonly publishInputBuilder: PublishInputBuilderService,
    private readonly bannedTerms: BannedTermsService,
    private readonly exportPacks: ExportPackGeneratorService,
    private readonly adapterRunner: AdapterRunnerService,
    private readonly queue: ConnectorQueueService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * The hard publish-blocking policy gate (featureslist.md 5.15) — runs
   * BEFORE a single `Listing` row is created, using the exact same
   * `BannedTermsService.lint` the dry-run preview calls. A violation on ANY
   * requested channel refuses the WHOLE publish call; nothing is partially
   * created, no `SyncJob` exists, no queue is touched.
   */
  async publish(tenantId: string, userId: string, input: PublishListingInput, locale: Locale = 'en'): Promise<PublishOutcome> {
    const channels = await this.listingsService.resolveChannels(tenantId, input.connectionIds);
    const violationsByChannel = new Map<string, PolicyViolation[]>();
    for (const channel of channels) {
      const effective = this.listingsService.computeEffectiveFields(input, channel);
      const violations = await this.bannedTerms.lint({ title: effective.title, description: effective.description, tags: effective.tags });
      if (violations.length > 0) {
        violationsByChannel.set(channel.connectorSlug, violations);
      }
    }
    if (violationsByChannel.size > 0) {
      throw new ForbiddenException({
        message: 'Publish blocked by the IP/trademark policy linter',
        code: 'policy_violation',
        violations: Object.fromEntries(violationsByChannel),
      });
    }

    const createdListings = await this.listingsService.create(tenantId, userId, input);
    const syncJob = await this.syncJobs.create({ tenantId, kind: 'PUBLISH', status: 'RUNNING', totalItems: createdListings.length, createdById: userId });
    await this.syncJobItems.createMany(
      createdListings.map((l) => ({ tenantId, syncJobId: syncJob.id, listingId: l.id, connectionId: l.connectionId, status: 'QUEUED' })),
    );
    const items = await this.syncJobItems.listForJob(tenantId, syncJob.id);

    const results: PublishOutcome['results'] = [];
    for (const created of createdListings) {
      const channel = channels.find((c) => c.connectionId === created.connectionId);
      const item = items.find((i) => i.listingId === created.id);
      if (channel === undefined || item === undefined) {
        continue;
      }
      const outcome = await this.processListingItem(tenantId, userId, created.id, channel, item.id, locale);
      results.push({ listingId: created.id, connectorSlug: channel.connectorSlug, ...outcome });
    }

    await this.syncJobs.recomputeCounters(tenantId, syncJob.id);
    await this.audit.record({ tenantId, actorId: userId, action: 'listing.publish_requested', entityType: 'SyncJob', entityId: syncJob.id, after: { listingCount: createdListings.length } });

    return { syncJobId: syncJob.id, listingIds: createdListings.map((l) => l.id), results };
  }

  /** One-click replay (5.7/4.7) — re-runs the exact same per-channel action
   * for a listing currently sitting in `ERROR`. Reuses
   * `ConnectorQueueService`'s DLQ/replay machinery when a queue job exists;
   * otherwise re-executes the same routing this listing would have taken on
   * its first attempt (Tier A/B automation vs. Export Pack generation). */
  async retryListing(tenantId: string, userId: string, listingId: string, locale: Locale = 'en'): Promise<{ ok: boolean; error: string | null }> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== 'ERROR') {
      throw new ForbiddenException('Only a listing in ERROR can be retried');
    }
    const [channel] = await this.listingsService.resolveChannels(tenantId, [listing.connectionId]);
    if (channel === undefined) {
      throw new NotFoundException('Channel for this listing no longer resolves');
    }
    const existingItems = await this.syncJobItems.findForListing(tenantId, listingId);
    const latestItem = existingItems[0];

    if (latestItem?.queueJobId !== undefined && latestItem?.queueJobId !== null && isQueueSlug(channel.connectorSlug)) {
      await this.queue.replay(channel.connectorSlug, latestItem.queueJobId);
      await this.listingEvents.record({ tenantId, listingId, type: 'RETRY', message: 'Replayed the queued publish job', actorId: userId });
      await this.listings.update(tenantId, listingId, { status: 'QUEUED', lastError: null });
      return { ok: true, error: null };
    }

    const itemId = latestItem?.id ?? (await this.ensureStandaloneSyncJobItem(tenantId, userId, listingId, listing.connectionId, 'RESYNC'));
    const outcome = await this.processListingItem(tenantId, userId, listingId, channel, itemId, locale);
    await this.listingEvents.record({ tenantId, listingId, type: 'RETRY', message: outcome.ok ? 'Retry succeeded' : `Retry failed: ${outcome.error}`, actorId: userId });
    return outcome;
  }

  /** Bulk-publish an EXISTING draft listing (task 4.8's PUBLISH bulk action)
   * — as opposed to `publish()` above, which creates brand-new `Listing`
   * rows from raw composer input. No status restriction beyond "not already
   * live" (unlike `retryListing`, which only accepts `ERROR`). */
  async publishExistingListing(tenantId: string, userId: string, listingId: string, locale: Locale = 'en', allowWhenLive = false): Promise<{ ok: boolean; error: string | null }> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status === 'LIVE' && !allowWhenLive) {
      throw new ForbiddenException('Listing is already live');
    }
    const [channel] = await this.listingsService.resolveChannels(tenantId, [listing.connectionId]);
    if (channel === undefined) {
      throw new NotFoundException('Channel for this listing no longer resolves');
    }
    const itemId = await this.ensureStandaloneSyncJobItem(tenantId, userId, listingId, listing.connectionId, 'PUBLISH');
    return this.processListingItem(tenantId, userId, listingId, channel, itemId, locale);
  }

  private async ensureStandaloneSyncJobItem(tenantId: string, userId: string, listingId: string, connectionId: string, kind: 'PUBLISH' | 'RESYNC'): Promise<string> {
    // A listing published/retried outside the original multi-channel fan-out
    // (e.g. a bulk action on an already-existing draft) still needs a real
    // SyncJobItem to record attempts/lastError against — creates a
    // single-item SyncJob rather than leaving the action untracked.
    const standaloneJob = await this.syncJobs.create({ tenantId, kind, status: 'RUNNING', totalItems: 1, createdById: userId });
    await this.syncJobItems.createMany([{ tenantId, syncJobId: standaloneJob.id, listingId, connectionId, status: 'QUEUED' }]);
    const itemId = (await this.syncJobItems.findForListing(tenantId, listingId))[0]?.id;
    if (itemId === undefined) {
      throw new NotFoundException('Could not create a sync job item for this listing');
    }
    return itemId;
  }

  /**
   * Routes ONE (listing x channel) unit of work — the function every fan-out
   * item and every retry ultimately calls. See the class doc comment for
   * exactly how the Tier-C boundary is enforced here.
   */
  private async processListingItem(
    tenantId: string,
    userId: string,
    listingId: string,
    channel: Awaited<ReturnType<ListingsService['resolveChannels']>>[number],
    syncJobItemId: string,
    locale: Locale,
  ): Promise<{ ok: boolean; error: string | null; route: 'QUEUED_AUTOMATION' | 'EXPORT_PACK' | 'UNSUPPORTED' }> {
    const connectorObj: Connector = {
      id: channel.connectorDefinitionId,
      slug: channel.connectorSlug,
      tier: channel.tier as Connector['tier'],
      capabilities: channel.capabilities as Connector['capabilities'],
      apiDocsUrl: channel.apiDocsUrl,
      tosUrl: channel.tosUrl,
    };

    if (!canAutomate(connectorObj)) {
      // Tier C (or any connector whose registry row does not declare
      // canAutomate: true) — Export Pack path ONLY. `sdkPublish` is
      // syntactically unreachable from this branch (see class doc comment).
      try {
        await this.exportPacks.generate(tenantId, userId, listingId, locale);
        await this.syncJobItems.update(tenantId, syncJobItemId, { status: 'SUCCEEDED' });
        return { ok: true, error: null, route: 'EXPORT_PACK' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.failItem(tenantId, listingId, syncJobItemId, message);
        return { ok: false, error: message, route: 'EXPORT_PACK' };
      }
    }

    if (!channel.capabilities.canPublish) {
      // Automatable (canAutomate: true) but NOT a storefront-listing target —
      // e.g. Prodigi, a pure fulfilment API with no publish/update/unpublish
      // (packages/connectors/src/adapters/prodigi.ts's own doc comment).
      // Real, honest "no automation path exists" — never faked.
      const message = `Connector "${channel.connectorSlug}" does not support channel listing publishing (fulfilment-only capability set)`;
      await this.failItem(tenantId, listingId, syncJobItemId, message);
      return { ok: false, error: message, route: 'UNSUPPORTED' };
    }

    if (!isQueueSlug(channel.connectorSlug)) {
      const message = `No queue is configured for connector "${channel.connectorSlug}"`;
      await this.failItem(tenantId, listingId, syncJobItemId, message);
      return { ok: false, error: message, route: 'UNSUPPORTED' };
    }

    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      const message = 'Listing not found while building the publish payload';
      await this.failItem(tenantId, listingId, syncJobItemId, message);
      return { ok: false, error: message, route: 'QUEUED_AUTOMATION' };
    }
    const listingVariantRows = await this.listingVariants.listForListing(tenantId, listingId);
    const { input: publishInput, warnings } = await this.publishInputBuilder.build(tenantId, listing, listingVariantRows);
    if (warnings.length > 0) {
      await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: `Payload warnings: ${warnings.join('; ')}`, actorId: userId });
    }

    const jobId = `${listingId}:${syncJobItemId}`;
    try {
      // Real BullMQ enqueue — cannot move a job through Redis in this
      // sandbox (docs/DEBT.md 3-D4). A failure here is captured as a
      // per-item error, exactly the "partial success" behaviour task 4.5
      // asks for, not a crashed request.
      const { jobId: queuedJobId } = await this.queue.enqueue(channel.connectorSlug, jobId, {
        tenantId,
        connectionId: channel.connectionId,
        kind: 'publish',
        payload: publishInput,
      });
      await this.syncJobItems.update(tenantId, syncJobItemId, { status: 'QUEUED', queueJobId: queuedJobId });
      await this.listings.update(tenantId, listingId, { status: 'QUEUED' });
      await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: `Queued for ${channel.connectorName}`, actorId: userId });
      return { ok: true, error: null, route: 'QUEUED_AUTOMATION' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failItem(tenantId, listingId, syncJobItemId, message);
      return { ok: false, error: message, route: 'QUEUED_AUTOMATION' };
    }
  }

  /** Called ONLY once a real (mocked-in-test or eventually real) queue
   * consumer processes a job — the counterpart to `enqueue` above, wired for
   * completeness even though nothing drives it automatically here (same
   * Redis gap). Kept real and callable so a future worker process is a
   * one-line wire-up, not new code. */
  async completeQueuedPublish(tenantId: string, listingId: string, syncJobItemId: string, result: { ok: true; externalListingId: string } | { ok: false; error: string }): Promise<void> {
    if (result.ok) {
      await this.listings.update(tenantId, listingId, { status: 'LIVE', externalListingId: result.externalListingId });
      await this.listingVariants.updateStatusForListing(tenantId, listingId, 'LIVE');
      await this.syncJobItems.update(tenantId, syncJobItemId, { status: 'SUCCEEDED' });
      await this.listingEvents.record({ tenantId, listingId, type: 'STATUS_CHANGE', message: 'Published live', actorId: null });
    } else {
      await this.failItem(tenantId, listingId, syncJobItemId, result.error);
    }
  }

  private async failItem(tenantId: string, listingId: string, syncJobItemId: string, message: string): Promise<void> {
    await this.listings.update(tenantId, listingId, { status: 'ERROR', lastError: message });
    await this.syncJobItems.update(tenantId, syncJobItemId, { status: 'FAILED', lastError: message, attempts: { increment: 1 } });
    await this.listingEvents.record({ tenantId, listingId, type: 'ERROR', message, actorId: null });
  }

  /** Exposed so `AdapterRunnerService`'s rate-limited/health-recorded path is
   * available to a future real worker (`startWorker`'s processor) without
   * re-deriving the `AutomatableConnector` gate a second time elsewhere —
   * still routes through the exact same `canAutomate` guard. */
  async runAutomatedPublish(tenantId: string, connectionId: string, connectorObj: Connector, publishInputArg: PublishInput) {
    if (!canAutomate(connectorObj)) {
      throw new ForbiddenException(`Connector "${connectorObj.slug}" is not automatable`);
    }
    return this.adapterRunner.run(tenantId, connectionId, (adapter, ctx) => sdkPublish(connectorObj, adapter, ctx, publishInputArg));
  }
}
