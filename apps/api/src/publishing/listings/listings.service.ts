import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AddListingCommentInput,
  ConnectorFieldSpec,
  DecideApprovalInput,
  ListingComposerInput,
  ListingDetail,
  ListingSummary,
  ListListingsQuery,
  SubmitForApprovalInput,
  UpdateListingInput,
} from '@omnisell/shared';
import { ListingRepository } from '../../repositories/listing.repository';
import { ListingVariantRepository } from '../../repositories/listing-variant.repository';
import { ListingFieldOverrideRepository } from '../../repositories/listing-field-override.repository';
import { ListingEventRepository } from '../../repositories/listing-event.repository';
import { ProductRepository } from '../../repositories/product.repository';
import { ProductVariantRepository } from '../../repositories/product-variant.repository';
import { ConnectionRepository } from '../../repositories/connection.repository';
import { ConnectorDefinitionRepository } from '../../repositories/connector-definition.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { applyChannelTransforms } from '../transform/field-transform.engine';

export interface ResolvedChannelContext {
  connectorDefinitionId: string;
  connectionId: string;
  connectorSlug: string;
  connectorName: string;
  tier: string;
  capabilities: { canAutomate: boolean; canPublish: boolean };
  fieldSpec: ConnectorFieldSpec | null;
  apiDocsUrl: string | null;
  tosUrl: string | null;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly listingVariants: ListingVariantRepository,
    private readonly overrides: ListingFieldOverrideRepository,
    private readonly events: ListingEventRepository,
    private readonly products: ProductRepository,
    private readonly productVariants: ProductVariantRepository,
    private readonly connections: ConnectionRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly audit: AuditLogService,
  ) {}

  /** Resolves every requested channel's real capabilities + fieldSpec from
   * the registry (never hardcoded — implentationplanphase.md task 4.2's
   * explicit instruction) — shared by the composer, dry-run, and publish
   * orchestrator so all three see identical channel facts. */
  async resolveChannels(tenantId: string, connectionIds: string[]): Promise<ResolvedChannelContext[]> {
    const resolved: ResolvedChannelContext[] = [];
    for (const connectionId of connectionIds) {
      const connection = await this.connections.findById(tenantId, connectionId);
      if (connection === null) {
        throw new NotFoundException(`Connection ${connectionId} not found`);
      }
      const definition = await this.connectorDefs.findById(connection.connectorId);
      if (definition === null) {
        throw new NotFoundException(`Connector definition for connection ${connectionId} not found`);
      }
      const capabilities = definition.capabilities as { canAutomate: boolean; canPublish: boolean };
      resolved.push({
        connectorDefinitionId: definition.id,
        connectionId,
        connectorSlug: connection.connectorSlug,
        connectorName: definition.name,
        tier: definition.tier,
        capabilities,
        fieldSpec: (definition.fieldSpec ?? null) as ConnectorFieldSpec | null,
        apiDocsUrl: definition.apiDocsUrl,
        tosUrl: definition.tosUrl,
      });
    }
    return resolved;
  }

  /** Per-channel effective fields (after overrides + fieldSpec truncation) —
   * the single computation dry-run/create/publish all share. */
  computeEffectiveFields(
    input: Pick<ListingComposerInput, 'title' | 'description' | 'tags' | 'category' | 'overrides'>,
    channel: ResolvedChannelContext,
  ) {
    const override = input.overrides[channel.connectionId] ?? {};
    return applyChannelTransforms({ title: input.title, description: input.description, tags: input.tags, category: input.category ?? null }, override, channel.fieldSpec);
  }

  /** Creates one Listing per requested channel (prompt.md's per-(product,
   * connection) design — see the schema comment on `Listing`). Each
   * Listing's title/description/tags ARE the effective, post-transform
   * values — `ListingFieldOverride` rows are kept purely as an editability/
   * audit record of which fields diverged from the canonical composer input. */
  async create(tenantId: string, userId: string, input: ListingComposerInput): Promise<ListingDetail[]> {
    const product = await this.products.findById(tenantId, input.productId);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    const channels = await this.resolveChannels(tenantId, input.connectionIds);
    const allProductVariants = await this.productVariants.listForProduct(tenantId, input.productId);
    const variantById = new Map(allProductVariants.map((v) => [v.id, v]));

    const created: ListingDetail[] = [];
    for (const channel of channels) {
      const effective = this.computeEffectiveFields(input, channel);

      const listing = await this.listings.create({
        tenantId,
        productId: input.productId,
        connectionId: channel.connectionId,
        connectorSlug: channel.connectorSlug,
        title: effective.title,
        description: effective.description,
        tags: effective.tags,
        category: effective.category,
        status: 'DRAFT',
        createdById: userId,
        ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
        ...(input.scheduledTimezone !== undefined ? { scheduledTimezone: input.scheduledTimezone } : {}),
      });

      const override = input.overrides[channel.connectionId];
      if (override !== undefined) {
        for (const [fieldKey, value] of Object.entries(override)) {
          await this.overrides.upsert(tenantId, listing.id, fieldKey, value as Prisma.InputJsonValue);
        }
      }

      const variantRows = input.variants.map((selection) => {
        const productVariant = variantById.get(selection.productVariantId);
        if (productVariant === undefined) {
          throw new BadRequestException(`Product variant ${selection.productVariantId} does not belong to this product`);
        }
        const resolved = resolveVariantPrice(productVariant, selection, channel.connectorSlug);
        return {
          tenantId,
          listingId: listing.id,
          productVariantId: selection.productVariantId,
          priceMinor: resolved.priceMinor,
          currency: resolved.currency,
          status: 'PENDING',
        };
      });
      await this.listingVariants.createMany(variantRows);

      await this.events.record({ tenantId, listingId: listing.id, type: 'STATUS_CHANGE', message: `Draft created for ${channel.connectorName}`, actorId: userId });
      await this.audit.record({ tenantId, actorId: userId, action: 'listing.created', entityType: 'Listing', entityId: listing.id, after: { productId: input.productId, connectionId: channel.connectionId } });

      created.push(await this.getDetail(tenantId, listing.id));
    }
    return created;
  }

  async update(tenantId: string, userId: string, listingId: string, input: UpdateListingInput): Promise<ListingDetail> {
    const existing = await this.listings.findById(tenantId, listingId);
    if (existing === null) {
      throw new NotFoundException('Listing not found');
    }
    if (existing.status === 'LIVE') {
      throw new ConflictException('A live listing cannot be edited directly — use reprice/retag bulk actions or unpublish first');
    }
    await this.listings.update(tenantId, listingId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt !== null ? new Date(input.scheduledAt) : null } : {}),
      ...(input.scheduledTimezone !== undefined ? { scheduledTimezone: input.scheduledTimezone } : {}),
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'listing.updated', entityType: 'Listing', entityId: listingId, before: existing, after: input });
    return this.getDetail(tenantId, listingId);
  }

  async list(tenantId: string, query: ListListingsQuery): Promise<{ items: ListingSummary[]; nextCursor: string | null }> {
    const statuses = query.status === undefined && query.view === 'REJECTED_OR_ERROR' ? ['REJECTED', 'ERROR'] : undefined;
    const scheduledOnly = query.view === 'SCHEDULED';
    const { items, nextCursor } = await this.listings.list(tenantId, {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(statuses !== undefined ? { statuses } : {}),
      ...(scheduledOnly ? { scheduledOnly: true, status: 'DRAFT' } : {}),
      ...(query.productId !== undefined ? { productId: query.productId } : {}),
      ...(query.connectionId !== undefined ? { connectionId: query.connectionId } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
    const summaries = await Promise.all(items.map((item) => this.toSummary(tenantId, item)));
    return { items: summaries, nextCursor };
  }

  async getDetail(tenantId: string, listingId: string): Promise<ListingDetail> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    const [variants, overrideRows, eventRows, product] = await Promise.all([
      this.listingVariants.listForListing(tenantId, listingId),
      this.overrides.listForListing(tenantId, listingId),
      this.events.listForListing(tenantId, listingId),
      this.products.findById(tenantId, listing.productId),
    ]);
    const productVariantRows = await this.productVariants.listForProduct(tenantId, listing.productId);
    const productVariantById = new Map(productVariantRows.map((v) => [v.id, v]));
    const connection = await this.connections.findById(tenantId, listing.connectionId);
    const definition = connection !== null ? await this.connectorDefs.findById(connection.connectorId) : null;

    return {
      id: listing.id,
      productId: listing.productId,
      productName: product?.name ?? '',
      connectionId: listing.connectionId,
      connectorSlug: listing.connectorSlug,
      connectionLabel: connection?.label ?? listing.connectorSlug,
      title: listing.title,
      description: listing.description,
      tags: listing.tags,
      category: listing.category,
      status: listing.status as ListingSummary['status'],
      approvalStatus: listing.approvalStatus as ListingSummary['approvalStatus'],
      isExportPackChannel: definition !== null ? (definition.capabilities as { canAutomate: boolean }).canAutomate !== true : false,
      scheduledAt: listing.scheduledAt?.toISOString() ?? null,
      scheduledTimezone: listing.scheduledTimezone,
      lastError: listing.lastError,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
      exportPackId: null,
      variants: variants.map((v) => {
        const pv = productVariantById.get(v.productVariantId);
        return {
          id: v.id,
          productVariantId: v.productVariantId,
          sku: pv?.sku ?? v.productVariantId,
          size: pv?.size ?? null,
          color: pv?.color ?? null,
          externalId: v.externalId,
          priceMinor: v.priceMinor.toString(),
          currency: v.currency,
          status: v.status,
        };
      }),
      overrides: overrideRows.map((o) => ({ fieldKey: o.fieldKey, value: o.valueJson })),
      events: eventRows.map((e) => ({ id: e.id, type: e.type, message: e.message, payload: e.payload, actorId: e.actorId, createdAt: e.createdAt.toISOString() })),
    };
  }

  async submitForApproval(tenantId: string, userId: string, listingId: string, input: SubmitForApprovalInput): Promise<ListingDetail> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.approvalStatus === 'SUBMITTED' || listing.approvalStatus === 'APPROVED') {
      throw new ConflictException(`Listing is already ${listing.approvalStatus.toLowerCase()}`);
    }
    await this.listings.update(tenantId, listingId, { approvalStatus: 'SUBMITTED', submittedForApprovalAt: new Date(), status: 'PENDING' });
    await this.events.record({ tenantId, listingId, type: 'SUBMITTED_FOR_APPROVAL', message: input.comment ?? 'Submitted for approval', actorId: userId });
    await this.audit.record({ tenantId, actorId: userId, action: 'listing.submitted_for_approval', entityType: 'Listing', entityId: listingId });
    return this.getDetail(tenantId, listingId);
  }

  /**
   * Approve/reject (featureslist.md 5.10 — "DESIGNER submits -> MANAGER
   * approves"). Reconciliation (docs/OPEN_QUESTIONS.md): brb.md's persona
   * table names a `MANAGER` role, but the actual 7-role `OrgRole` enum from
   * Phase 1 (prompt.md Phase 1.4) has no such role — this call is CASL-gated
   * at the controller (`ability.can('update', 'Listing')`, granted to
   * OWNER/ADMIN, the closest existing roles to "Studio Manager"), not here;
   * this service only enforces the state transition, not who may call it.
   */
  async decideApproval(tenantId: string, userId: string, listingId: string, input: DecideApprovalInput): Promise<ListingDetail> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.approvalStatus !== 'SUBMITTED') {
      throw new ConflictException('Only a submitted listing can be approved or rejected');
    }
    if (input.decision === 'APPROVED') {
      await this.listings.update(tenantId, listingId, { approvalStatus: 'APPROVED', approvedAt: new Date(), approvedById: userId });
    } else {
      await this.listings.update(tenantId, listingId, {
        approvalStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: input.comment ?? 'Rejected without a stated reason',
        status: 'REJECTED',
      });
    }
    await this.events.record({ tenantId, listingId, type: input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED', message: input.comment ?? input.decision, actorId: userId });
    await this.audit.record({ tenantId, actorId: userId, action: `listing.${input.decision.toLowerCase()}`, entityType: 'Listing', entityId: listingId, after: { comment: input.comment ?? null } });
    return this.getDetail(tenantId, listingId);
  }

  async addComment(tenantId: string, userId: string, listingId: string, input: AddListingCommentInput): Promise<ListingDetail> {
    const listing = await this.listings.findById(tenantId, listingId);
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    await this.events.record({ tenantId, listingId, type: 'COMMENT', message: input.body, actorId: userId });
    return this.getDetail(tenantId, listingId);
  }

  private async toSummary(tenantId: string, listing: Awaited<ReturnType<ListingRepository['findById']>>): Promise<ListingSummary> {
    if (listing === null) {
      throw new NotFoundException('Listing not found');
    }
    const [product, connection] = await Promise.all([
      this.products.findById(tenantId, listing.productId),
      this.connections.findById(tenantId, listing.connectionId),
    ]);
    const definition = connection !== null ? await this.connectorDefs.findById(connection.connectorId) : null;
    return {
      id: listing.id,
      productId: listing.productId,
      productName: product?.name ?? '',
      connectionId: listing.connectionId,
      connectorSlug: listing.connectorSlug,
      connectionLabel: connection?.label ?? listing.connectorSlug,
      title: listing.title,
      status: listing.status as ListingSummary['status'],
      approvalStatus: listing.approvalStatus as ListingSummary['approvalStatus'],
      isExportPackChannel: definition !== null ? (definition.capabilities as { canAutomate: boolean }).canAutomate !== true : false,
      scheduledAt: listing.scheduledAt?.toISOString() ?? null,
      scheduledTimezone: listing.scheduledTimezone,
      lastError: listing.lastError,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    };
  }
}

export function resolveVariantPrice(
  productVariant: { baseCostMinor: bigint; currency: string; prices: Array<{ channel: string; currency: string; priceMinor: bigint }> },
  selection: { priceMinor?: string | undefined; currency?: string | undefined },
  connectorSlug: string,
): { priceMinor: bigint; currency: string } {
  if (selection.priceMinor !== undefined) {
    return { priceMinor: BigInt(selection.priceMinor), currency: selection.currency ?? productVariant.currency };
  }
  const channelPrice = productVariant.prices.find((p) => p.channel === connectorSlug) ?? productVariant.prices.find((p) => p.channel === 'default');
  if (channelPrice !== undefined) {
    return { priceMinor: channelPrice.priceMinor, currency: channelPrice.currency };
  }
  return { priceMinor: productVariant.baseCostMinor, currency: productVariant.currency };
}
