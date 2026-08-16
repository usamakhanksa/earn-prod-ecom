import { Injectable } from '@nestjs/common';
import type { Expense, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Expense tracking + receipt upload (Phase 6, task 6.5). Reuses Phase 2's
 * `S3PresignService`/`ObjectStorageService` for the receipt bytes — this
 * repository only persists the resulting `storageKey` plus OCR bookkeeping
 * (`ocrStatus` stays `'UNAVAILABLE'`, the honest default, unless a real OCR
 * engine is ever wired in — see `ExpenseService`'s doc comment).
 */
@Injectable()
export class ExpenseRepository extends TenantScopedRepository<Pick<PrismaService, 'expense'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.ExpenseUncheckedCreateInput): Promise<Expense> {
    return this.prisma.expense.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Expense | null> {
    return this.prisma.expense.findFirst({ where: { id, tenantId } });
  }

  async list(tenantId: string, filters: { status?: string; category?: string }, cursor: string | undefined, limit: number): Promise<{ items: Expense[]; nextCursor: string | null }> {
    const where: Prisma.ExpenseWhereInput = { tenantId };
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.category !== undefined) {
      where.category = filters.category;
    }
    const items = await this.prisma.expense.findMany({
      where,
      orderBy: { incurredAt: 'desc' },
      take: limit + 1,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async decide(tenantId: string, id: string, data: { status: string; approvedById: string; approvedAt: Date; ledgerEntryId?: string }): Promise<Expense | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.expense.update({ where: { id }, data });
  }

  async sumForPeriod(tenantId: string, from: Date, to: Date): Promise<{ amountMinor: bigint; currency: string | null }> {
    const rows = await this.prisma.expense.findMany({
      where: { tenantId, status: 'APPROVED', incurredAt: { gte: from, lte: to } },
      select: { amountMinor: true, currency: true },
    });
    const amountMinor = rows.reduce((acc, r) => acc + r.amountMinor, 0n);
    return { amountMinor, currency: rows[0]?.currency ?? null };
  }
}
