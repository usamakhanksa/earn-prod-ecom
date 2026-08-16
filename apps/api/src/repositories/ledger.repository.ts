import { Injectable } from '@nestjs/common';
import type { Prisma, LedgerEntry, LedgerLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

export interface LedgerLineInput {
  accountCode: string;
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: bigint;
  currencyCode: string;
}

/**
 * Minimal double-entry ledger primitive (prompt.md "CONSUMER MODE" section /
 * docs/points-extension.md §7.4). This repository is intentionally dumb — it
 * writes exactly what it is given; the DEBIT-equals-CREDIT invariant is
 * asserted by `LedgerService.postBalancedEntry` BEFORE this is ever called,
 * so a caller cannot bypass the check by going around the service.
 */
@Injectable()
export class LedgerRepository extends TenantScopedRepository<Pick<PrismaService, 'ledgerEntry'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createEntry(
    input: {
      tenantId: string;
      memo: string;
      sourceType: string;
      sourceId?: string | null;
      lines: LedgerLineInput[];
      // Phase 6 additions (tasks 6.1/6.6/6.11) — all optional, defaulted, so
      // every Phase 4.5 call site (which never set these) is unaffected.
      occurredAt?: Date;
      isAdjustment?: boolean;
      reasonCode?: string | null;
      createdById?: string | null;
    },
    client: Client = this.prisma,
  ): Promise<LedgerEntry & { lines: LedgerLine[] }> {
    return client.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        memo: input.memo,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
        isAdjustment: input.isAdjustment ?? false,
        reasonCode: input.reasonCode ?? null,
        createdById: input.createdById ?? null,
        lines: {
          create: input.lines.map((line) => ({
            tenantId: input.tenantId,
            accountCode: line.accountCode,
            direction: line.direction,
            amountMinor: line.amountMinor,
            currencyCode: line.currencyCode,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async findBySource(tenantId: string, sourceType: string, sourceId: string): Promise<(LedgerEntry & { lines: LedgerLine[] })[]> {
    return this.prisma.ledgerEntry.findMany({ where: { tenantId, sourceType, sourceId }, include: { lines: true } });
  }

  /** Finance Ledger view (task 6.1 web surface) — paginated, filterable by
   * account/source/date, newest first. */
  async list(
    tenantId: string,
    filters: { accountCode?: string; sourceType?: string; from?: Date; to?: Date },
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: (LedgerEntry & { lines: LedgerLine[] })[]; nextCursor: string | null }> {
    const where: Prisma.LedgerEntryWhereInput = { tenantId };
    if (filters.sourceType !== undefined) {
      where.sourceType = filters.sourceType;
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      where.occurredAt = {
        ...(filters.from !== undefined ? { gte: filters.from } : {}),
        ...(filters.to !== undefined ? { lte: filters.to } : {}),
      };
    }
    if (filters.accountCode !== undefined) {
      where.lines = { some: { accountCode: filters.accountCode } };
    }
    const items = await this.prisma.ledgerEntry.findMany({
      where,
      include: { lines: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** Net balance (sum of DEBIT minus sum of CREDIT) per account code, for
   * entries whose `occurredAt` falls in `[from, to]` — the read side P&L/tax
   * reports and the reconciliation engine's "expected" figure both build on.
   * A positive result for an asset/expense account is its normal debit
   * balance; for a revenue/liability account a normal CREDIT balance shows
   * as negative here — callers negate as appropriate for display (see
   * `PnlService`). */
  async sumByAccount(tenantId: string, accountCodes: string[], from: Date, to: Date): Promise<Record<string, bigint>> {
    const lines = await this.prisma.ledgerLine.findMany({
      where: { tenantId, accountCode: { in: accountCodes }, ledgerEntry: { occurredAt: { gte: from, lte: to } } },
      select: { accountCode: true, direction: true, amountMinor: true },
    });
    const totals: Record<string, bigint> = {};
    for (const code of accountCodes) {
      totals[code] = 0n;
    }
    for (const line of lines) {
      totals[line.accountCode] = (totals[line.accountCode] ?? 0n) + (line.direction === 'DEBIT' ? line.amountMinor : -line.amountMinor);
    }
    return totals;
  }

  /** Same query as `sumByAccount` but keeps debit/credit totals separate
   * (task 6.6's cash-flow report needs cash-IN vs cash-OUT, not just a net
   * balance). */
  async sumDirectionalByAccount(tenantId: string, accountCodes: string[], from: Date, to: Date): Promise<Record<string, { debit: bigint; credit: bigint }>> {
    const lines = await this.prisma.ledgerLine.findMany({
      where: { tenantId, accountCode: { in: accountCodes }, ledgerEntry: { occurredAt: { gte: from, lte: to } } },
      select: { accountCode: true, direction: true, amountMinor: true },
    });
    const totals: Record<string, { debit: bigint; credit: bigint }> = {};
    for (const code of accountCodes) {
      totals[code] = { debit: 0n, credit: 0n };
    }
    for (const line of lines) {
      const bucket = totals[line.accountCode] ?? { debit: 0n, credit: 0n };
      if (line.direction === 'DEBIT') {
        bucket.debit += line.amountMinor;
      } else {
        bucket.credit += line.amountMinor;
      }
      totals[line.accountCode] = bucket;
    }
    return totals;
  }
}
