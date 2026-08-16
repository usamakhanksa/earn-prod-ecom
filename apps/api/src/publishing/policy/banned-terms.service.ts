import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BannedTermView, CreateBannedTermInput, UpdateBannedTermInput } from '@omnisell/shared';
import { BannedTermRepository } from '../../repositories/banned-term.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { lintListingFields, type BannedTermLike, type ListingFieldsToLint } from './ip-linter.engine';

/**
 * Admin-editable banned-term dictionary (featureslist.md 5.15,
 * implentationplanphase.md task 4.11) — global, same as `ConnectorDefinition`
 * (see `BannedTermRepository`'s doc comment). `lint()` is the exact function
 * the publish orchestrator's hard gate calls — one dictionary, one matching
 * engine, no second implementation to drift out of sync.
 */
@Injectable()
export class BannedTermsService {
  constructor(
    private readonly terms: BannedTermRepository,
    private readonly audit: AuditLogService,
  ) {}

  async listActive(): Promise<BannedTermView[]> {
    return (await this.terms.listActive()).map(toView);
  }

  async adminListAll(): Promise<BannedTermView[]> {
    return (await this.terms.listAll()).map(toView);
  }

  async adminCreate(input: CreateBannedTermInput, adminUserId: string): Promise<BannedTermView> {
    const created = await this.terms.create({ term: input.term, category: input.category, matchType: input.matchType, note: input.note ?? null, createdBy: adminUserId }).catch((error: unknown) => {
      throw error instanceof Error && error.message.includes('Unique constraint') ? new ConflictException(`"${input.term}" already exists in category ${input.category}`) : error;
    });
    await this.audit.record({ actorId: adminUserId, action: 'banned_term.created', entityType: 'BannedTerm', entityId: created.id, after: toView(created) });
    return toView(created);
  }

  async adminUpdate(id: string, input: UpdateBannedTermInput, adminUserId: string): Promise<BannedTermView> {
    const existing = await this.terms.findById(id);
    if (existing === null) {
      throw new NotFoundException('Banned term not found');
    }
    const updated = await this.terms.update(id, {
      ...(input.term !== undefined ? { term: input.term } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    await this.audit.record({ actorId: adminUserId, action: 'banned_term.updated', entityType: 'BannedTerm', entityId: id, before: toView(existing), after: toView(updated) });
    return toView(updated);
  }

  async adminDelete(id: string, adminUserId: string): Promise<void> {
    const existing = await this.terms.findById(id);
    if (existing === null) {
      throw new NotFoundException('Banned term not found');
    }
    await this.terms.delete(id);
    await this.audit.record({ actorId: adminUserId, action: 'banned_term.deleted', entityType: 'BannedTerm', entityId: id, before: toView(existing) });
  }

  /** The hard publish-blocking gate itself (5.15) — pulls the live dictionary
   * and delegates to the pure matching engine. */
  async lint(fields: ListingFieldsToLint) {
    const terms = await this.terms.listActive();
    const asLike: BannedTermLike[] = terms.map((t) => ({ term: t.term, category: t.category, matchType: t.matchType as 'EXACT' | 'FUZZY' }));
    return lintListingFields(fields, asLike);
  }
}

function toView(row: { id: string; term: string; category: string; matchType: string; note: string | null; isActive: boolean; createdBy: string | null; createdAt: Date; updatedAt: Date }): BannedTermView {
  return {
    id: row.id,
    term: row.term,
    category: row.category as BannedTermView['category'],
    matchType: row.matchType as BannedTermView['matchType'],
    note: row.note,
    isActive: row.isActive,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
