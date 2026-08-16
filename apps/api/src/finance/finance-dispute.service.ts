import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { FinanceDispute } from '@prisma/client';
import { FinanceDisputeRepository } from '../repositories/finance-dispute.repository';

/** Admin finance ops: disputes register (Phase 6, task 6.11). */
@Injectable()
export class FinanceDisputeService {
  constructor(private readonly disputes: FinanceDisputeRepository) {}

  async create(tenantId: string, actorId: string, input: { sourceType: string; sourceId: string; amountMinor: bigint; currency: string; reasonCode: string; note?: string }): Promise<FinanceDispute> {
    return this.disputes.create({ tenantId, raisedById: actorId, ...input, note: input.note ?? null });
  }

  async list(tenantId: string, status?: string): Promise<FinanceDispute[]> {
    return this.disputes.list(tenantId, status);
  }

  async resolve(tenantId: string, id: string, status: 'RESOLVED' | 'REJECTED', actorId: string, note?: string): Promise<FinanceDispute> {
    const existing = await this.disputes.findById(tenantId, id);
    if (existing === null) {
      throw new NotFoundException({ message: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' });
    }
    if (existing.status !== 'OPEN') {
      throw new ForbiddenException({ message: `Dispute is already ${existing.status.toLowerCase()}`, code: 'DISPUTE_ALREADY_RESOLVED' });
    }
    const updated = await this.disputes.resolve(tenantId, id, status, actorId, note);
    return updated ?? existing;
  }

  /** Admin finance ops (task 6.11) — platform-wide, cross-tenant reads +
   * a cross-tenant resolve action, mirroring `AdminOrderExceptionsController`'s
   * pattern (real query, no per-tenant scoping, behind `AdminOnlyGuard`). */
  async listAllForAdmin(status?: string) {
    return this.disputes.listAllForAdmin(status);
  }

  async resolveForAdmin(id: string, status: 'RESOLVED' | 'REJECTED', actorId: string, note?: string): Promise<FinanceDispute> {
    const existing = await this.disputes.findByIdForAdmin(id);
    if (existing === null) {
      throw new NotFoundException({ message: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' });
    }
    if (existing.status !== 'OPEN') {
      throw new ForbiddenException({ message: `Dispute is already ${existing.status.toLowerCase()}`, code: 'DISPUTE_ALREADY_RESOLVED' });
    }
    const updated = await this.disputes.resolve(existing.tenantId, id, status, actorId, note);
    return updated ?? existing;
  }
}
