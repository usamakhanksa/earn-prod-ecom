import { Injectable } from '@nestjs/common';
import type { FinanceDispute, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Admin finance ops: disputes register (Phase 6, task 6.11). */
@Injectable()
export class FinanceDisputeRepository extends TenantScopedRepository<Pick<PrismaService, 'financeDispute'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.FinanceDisputeUncheckedCreateInput): Promise<FinanceDispute> {
    return this.prisma.financeDispute.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<FinanceDispute | null> {
    return this.prisma.financeDispute.findFirst({ where: { id, tenantId } });
  }

  async list(tenantId: string, status?: string): Promise<FinanceDispute[]> {
    return this.prisma.financeDispute.findMany({ where: { tenantId, ...(status !== undefined ? { status } : {}) }, orderBy: { createdAt: 'desc' } });
  }

  async resolve(tenantId: string, id: string, status: string, resolvedById: string, note?: string): Promise<FinanceDispute | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.financeDispute.update({ where: { id }, data: { status, resolvedById, resolvedAt: new Date(), note: note ?? existing.note } });
  }

  /** Admin finance ops (task 6.11) — platform-wide, cross-tenant, same
   * pattern as `OrderExceptionRepository.listBreachedAcrossTenantsForAdmin`:
   * a real cross-tenant query behind `AdminOnlyGuard`, never a fabricated
   * aggregate. */
  async listAllForAdmin(status?: string): Promise<Array<FinanceDispute & { tenant: { name: string } }>> {
    return this.prisma.financeDispute.findMany({
      where: status !== undefined ? { status } : {},
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findByIdForAdmin(id: string): Promise<FinanceDispute | null> {
    return this.prisma.financeDispute.findUnique({ where: { id } });
  }
}
