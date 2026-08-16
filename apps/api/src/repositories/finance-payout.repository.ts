import { Injectable } from '@nestjs/common';
import type { FinancePayout, FinancePayoutLine, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export type FinancePayoutWithLines = FinancePayout & { lines: FinancePayoutLine[] };

/**
 * Earnings ingestion + payout reconciliation (Phase 6, task 6.4). Owns
 * `FinancePayout` + its per-order `FinancePayoutLine` children, same
 * "one repository per closely-related cluster" convention `OrderRepository`
 * already follows for `Order`+`OrderItem`+`OrderFee`.
 */
@Injectable()
export class FinancePayoutRepository extends TenantScopedRepository<Pick<PrismaService, 'financePayout'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createWithLines(
    payout: Prisma.FinancePayoutUncheckedCreateInput,
    lines: Array<Omit<Prisma.FinancePayoutLineUncheckedCreateInput, 'financePayoutId' | 'tenantId'>>,
  ): Promise<FinancePayoutWithLines> {
    return this.prisma.financePayout.create({
      data: { ...payout, lines: { create: lines.map((l) => ({ ...l, tenantId: payout.tenantId })) } },
      include: { lines: true },
    });
  }

  async findById(tenantId: string, id: string): Promise<FinancePayoutWithLines | null> {
    return this.prisma.financePayout.findFirst({ where: { id, tenantId }, include: { lines: true } });
  }

  async findOpenForPeriod(tenantId: string, connectionId: string | null, periodStart: Date, periodEnd: Date): Promise<FinancePayoutWithLines | null> {
    return this.prisma.financePayout.findFirst({
      where: { tenantId, connectionId, periodStart, periodEnd, status: 'EXPECTED' },
      include: { lines: true },
    });
  }

  async list(tenantId: string, filters: { status?: string; varianceStatus?: string }, cursor: string | undefined, limit: number): Promise<{ items: FinancePayoutWithLines[]; nextCursor: string | null }> {
    const where: Prisma.FinancePayoutWhereInput = { tenantId };
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.varianceStatus !== undefined) {
      where.varianceStatus = filters.varianceStatus;
    }
    const items = await this.prisma.financePayout.findMany({
      where,
      include: { lines: true },
      orderBy: { periodStart: 'desc' },
      take: limit + 1,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async update(tenantId: string, id: string, data: Prisma.FinancePayoutUpdateInput): Promise<FinancePayoutWithLines | null> {
    const existing = await this.prisma.financePayout.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.financePayout.update({ where: { id }, data, include: { lines: true } });
  }

  async linkReconciledLedgerLine(lineId: string, ledgerLineId: string): Promise<void> {
    await this.prisma.financePayoutLine.update({ where: { id: lineId }, data: { reconciledLedgerLineId: ledgerLineId } });
  }

  /** Admin reconciliation board (task 6.11) — platform-wide, cross-tenant:
   * every payout currently flagged with a variance an accountant should
   * look at, real, never fabricated. */
  async listVarianceFlaggedForAdmin(): Promise<Array<FinancePayout & { tenant: { name: string } }>> {
    return this.prisma.financePayout.findMany({
      where: { varianceStatus: { in: ['MAJOR_VARIANCE', 'DISPUTED'] } },
      include: { tenant: { select: { name: true } } },
      orderBy: { periodStart: 'desc' },
      take: 200,
    });
  }
}
