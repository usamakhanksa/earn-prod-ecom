import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ConnectorDefinitionInput,
  ConnectorDefinitionSummary,
  ListConnectorsQuery,
  UpdateConnectorDefinitionInput,
} from '@omnisell/shared';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * Connector registry (prompt.md — "the spine of the product"). Read side
 * powers the capability matrix (featureslist.md 4.6, signature moment #3);
 * write side is the admin CRUD screen (featureslist.md 4.15/14.6) — gated by
 * `AdminOnlyGuard` at the controller, not here, matching every other admin
 * service's split in this codebase.
 */
@Injectable()
export class ConnectorsService {
  constructor(
    private readonly connectors: ConnectorDefinitionRepository,
    private readonly audit: AuditLogService,
  ) {}

  /** Non-admin callers never see `UNVERIFIED` (Tier D quarantine) rows
   * (brb.md §6 — "Hidden from users") unless they explicitly ask, which only
   * the admin registry screen does. */
  async list(query: ListConnectorsQuery): Promise<ConnectorDefinitionSummary[]> {
    const rows = await this.connectors.list({
      ...(query.tier !== undefined ? { tier: query.tier } : {}),
      ...(query.category !== undefined ? { category: query.category } : {}),
      includeQuarantined: query.includeQuarantined,
    });
    return rows.map(toSummary);
  }

  async getBySlug(slug: string): Promise<ConnectorDefinitionSummary> {
    const row = await this.connectors.findBySlug(slug);
    if (row === null) {
      throw new NotFoundException(`Connector "${slug}" is not registered`);
    }
    return toSummary(row);
  }

  // --- Admin CRUD (featureslist.md 4.15/14.6) ---

  async adminCreate(input: ConnectorDefinitionInput, adminUserId: string): Promise<ConnectorDefinitionSummary> {
    const existing = await this.connectors.findBySlug(input.slug);
    if (existing !== null) {
      throw new ConflictException(`Connector "${input.slug}" already exists`);
    }
    const created = await this.connectors.create(toCreateInput(input));
    await this.audit.record({
      actorId: adminUserId,
      action: 'connector_registry.created',
      entityType: 'ConnectorDefinition',
      entityId: created.id,
      after: toSummary(created),
    });
    return toSummary(created);
  }

  async adminUpdate(slug: string, input: UpdateConnectorDefinitionInput, adminUserId: string): Promise<ConnectorDefinitionSummary> {
    const existing = await this.connectors.findBySlug(slug);
    if (existing === null) {
      throw new NotFoundException(`Connector "${slug}" is not registered`);
    }
    const updated = await this.connectors.update(existing.id, toUpdateInput(input));
    await this.audit.record({
      actorId: adminUserId,
      action: 'connector_registry.updated',
      entityType: 'ConnectorDefinition',
      entityId: existing.id,
      before: toSummary(existing),
      after: toSummary(updated),
    });
    return toSummary(updated);
  }

  /** Quarantine toggle (featureslist.md 4.15) — flips `status` to/from
   * `UNVERIFIED`, which hides the connector from every non-admin surface. */
  async adminSetQuarantine(slug: string, quarantined: boolean, adminUserId: string): Promise<ConnectorDefinitionSummary> {
    const existing = await this.connectors.findBySlug(slug);
    if (existing === null) {
      throw new NotFoundException(`Connector "${slug}" is not registered`);
    }
    const updated = await this.connectors.update(existing.id, { status: quarantined ? 'UNVERIFIED' : 'ACTIVE' });
    await this.audit.record({
      actorId: adminUserId,
      action: quarantined ? 'connector_registry.quarantined' : 'connector_registry.unquarantined',
      entityType: 'ConnectorDefinition',
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return toSummary(updated);
  }

  /** Marks a connector as human-verified per api-registration.md §7's
   * mandatory protocol. `verifiedBy` must be a person's name, not a service
   * account — enforced at the zod schema layer as a non-empty string, the
   * "is it actually a person" part is a process control this pass cannot
   * enforce in code and is documented as such in docs/CONNECTORS.md. */
  async adminSetVerification(slug: string, verifiedBy: string, adminUserId: string): Promise<ConnectorDefinitionSummary> {
    const existing = await this.connectors.findBySlug(slug);
    if (existing === null) {
      throw new NotFoundException(`Connector "${slug}" is not registered`);
    }
    const updated = await this.connectors.update(existing.id, { verifiedAt: new Date(), verifiedBy });
    await this.audit.record({
      actorId: adminUserId,
      action: 'connector_registry.verified',
      entityType: 'ConnectorDefinition',
      entityId: existing.id,
      after: { verifiedAt: updated.verifiedAt, verifiedBy: updated.verifiedBy },
    });
    return toSummary(updated);
  }

  /** Admin-only variant of `list` that includes quarantined rows regardless
   * of the caller's query — the registry screen's whole point is seeing
   * everything, verified or not (featureslist.md 14.6). */
  async adminListAll(): Promise<ConnectorDefinitionSummary[]> {
    const rows = await this.connectors.list({ includeQuarantined: true });
    return rows.map(toSummary);
  }
}

function toSummary(row: {
  id: string;
  slug: string;
  name: string;
  category: string;
  tier: string;
  status: string;
  authType: string;
  apiDocsUrl: string | null;
  tosUrl: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  requiresPartnerApproval: boolean;
  rateLimit: unknown;
  capabilities: unknown;
  fieldSpec: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ConnectorDefinitionSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    tier: row.tier,
    status: row.status,
    authType: row.authType,
    apiDocsUrl: row.apiDocsUrl,
    tosUrl: row.tosUrl,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedBy: row.verifiedBy,
    requiresPartnerApproval: row.requiresPartnerApproval,
    rateLimit: row.rateLimit,
    capabilities: row.capabilities,
    fieldSpec: row.fieldSpec,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCreateInput(input: ConnectorDefinitionInput): Prisma.ConnectorDefinitionUncheckedCreateInput {
  return {
    slug: input.slug,
    name: input.name,
    category: input.category,
    tier: input.tier,
    status: input.status,
    authType: input.authType,
    apiDocsUrl: input.apiDocsUrl ?? null,
    tosUrl: input.tosUrl ?? null,
    verifiedAt: input.verifiedAt !== undefined && input.verifiedAt !== null ? new Date(input.verifiedAt) : null,
    verifiedBy: input.verifiedBy ?? null,
    requiresPartnerApproval: input.requiresPartnerApproval,
    rateLimit: input.rateLimit as Prisma.InputJsonValue,
    capabilities: input.capabilities as Prisma.InputJsonValue,
    fieldSpec: (input.fieldSpec ?? null) as Prisma.InputJsonValue,
  };
}

function toUpdateInput(input: UpdateConnectorDefinitionInput): Prisma.ConnectorDefinitionUpdateInput {
  const data: Prisma.ConnectorDefinitionUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.category !== undefined) data.category = input.category;
  if (input.tier !== undefined) data.tier = input.tier;
  if (input.status !== undefined) data.status = input.status;
  if (input.authType !== undefined) data.authType = input.authType;
  if (input.apiDocsUrl !== undefined) data.apiDocsUrl = input.apiDocsUrl;
  if (input.tosUrl !== undefined) data.tosUrl = input.tosUrl;
  if (input.verifiedAt !== undefined) data.verifiedAt = input.verifiedAt !== null ? new Date(input.verifiedAt) : null;
  if (input.verifiedBy !== undefined) data.verifiedBy = input.verifiedBy;
  if (input.requiresPartnerApproval !== undefined) data.requiresPartnerApproval = input.requiresPartnerApproval;
  if (input.rateLimit !== undefined) data.rateLimit = input.rateLimit as Prisma.InputJsonValue;
  if (input.capabilities !== undefined) data.capabilities = input.capabilities as Prisma.InputJsonValue;
  if (input.fieldSpec !== undefined) data.fieldSpec = (input.fieldSpec ?? null) as Prisma.InputJsonValue;
  return data;
}
