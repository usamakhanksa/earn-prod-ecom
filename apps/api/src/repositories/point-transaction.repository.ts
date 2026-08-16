import { Injectable } from '@nestjs/common';
import type { Prisma, PointTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

export interface CreatePointTransactionInput {
  walletId: string;
  tenantId: string;
  userId: string;
  type: 'EARN' | 'SPEND' | 'ADJUST' | 'EXPIRY';
  amount: bigint; // signed
  source: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: 'PENDING' | 'VALIDATED' | 'REVERSED';
  validatedAt?: Date | null;
  expiresAt?: Date | null;
}

/**
 * `PointTransaction` is the ONLY authoritative source of wallet balance
 * (docs/points-extension.md §3.5/§6.2) — every method here that mutates a row
 * accepts an optional Prisma transaction client so callers (WalletService,
 * VideoWatchService's award path, RedemptionService) can run the whole
 * award/spend flow — cap/cooldown checks + the new row + the wallet CAS update
 * — inside one DB transaction, per §7.1's "enforced at award time inside the
 * same DB transaction" rule.
 */
@Injectable()
export class PointTransactionRepository extends TenantScopedRepository<Pick<PrismaService, 'pointTransaction'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: CreatePointTransactionInput, client: Client = this.prisma): Promise<PointTransaction> {
    return client.pointTransaction.create({
      data: {
        walletId: input.walletId,
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        source: input.source,
        sourceId: input.sourceId ?? null,
        ...(input.metadata !== undefined && input.metadata !== null
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
        status: input.status ?? 'PENDING',
        validatedAt: input.validatedAt ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async markValidated(tenantId: string, id: string, client: Client = this.prisma): Promise<PointTransaction> {
    return client.pointTransaction.update({
      where: { id, tenantId },
      data: { status: 'VALIDATED', validatedAt: new Date() },
    });
  }

  async markReversed(tenantId: string, id: string, client: Client = this.prisma): Promise<PointTransaction> {
    return client.pointTransaction.update({ where: { id, tenantId }, data: { status: 'REVERSED' } });
  }

  /** Idempotent double-award guard (§14/§16 DoD): a VALIDATED row already keyed
   * by this exact (tenantId, source, sourceId) means "already awarded". */
  async findValidatedBySource(tenantId: string, source: string, sourceId: string, client: Client = this.prisma): Promise<PointTransaction | null> {
    return client.pointTransaction.findFirst({
      where: { tenantId, source, sourceId, status: 'VALIDATED' },
    });
  }

  async findBySource(tenantId: string, source: string, sourceId: string, client: Client = this.prisma): Promise<PointTransaction | null> {
    return client.pointTransaction.findFirst({ where: { tenantId, source, sourceId } });
  }

  /** Sum of VALIDATED deltas for a wallet — the balance-derivation authority
   * (§3.5/§6.2). Never includes PENDING/REVERSED rows. */
  async sumValidated(tenantId: string, walletId: string, client: Client = this.prisma): Promise<bigint> {
    const rows = await client.pointTransaction.findMany({
      where: { tenantId, walletId, status: 'VALIDATED' },
      select: { amount: true },
    });
    return rows.reduce((acc, row) => acc + row.amount, 0n);
  }

  /** Sum of VALIDATED EARN amounts for one user across a tenant-local day
   * (§7.3's global + per-action daily caps). `action` filters by `source`. */
  async sumEarnedSince(
    tenantId: string,
    userId: string,
    since: Date,
    action?: string,
    client: Client = this.prisma,
  ): Promise<bigint> {
    const rows = await client.pointTransaction.findMany({
      where: {
        tenantId,
        userId,
        type: 'EARN',
        status: { in: ['VALIDATED', 'PENDING'] }, // PENDING counts too — a cap must not be gameable by racing unvalidated awards
        createdAt: { gte: since },
        ...(action !== undefined ? { source: action } : {}),
      },
      select: { amount: true },
    });
    return rows.reduce((acc, row) => acc + row.amount, 0n);
  }

  async findLastEarnForAction(tenantId: string, userId: string, action: string, client: Client = this.prisma): Promise<PointTransaction | null> {
    return client.pointTransaction.findFirst({
      where: { tenantId, userId, source: action, type: 'EARN' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForWallet(
    tenantId: string,
    walletId: string,
    filters: { type?: string; dateFrom?: Date; dateTo?: Date; cursor?: string; limit: number },
  ): Promise<PointTransaction[]> {
    return this.prisma.pointTransaction.findMany({
      where: {
        tenantId,
        walletId,
        ...(filters.type !== undefined ? { type: filters.type } : {}),
        ...(filters.dateFrom !== undefined || filters.dateTo !== undefined
          ? { createdAt: { ...(filters.dateFrom !== undefined ? { gte: filters.dateFrom } : {}), ...(filters.dateTo !== undefined ? { lte: filters.dateTo } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      ...(filters.cursor !== undefined ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
  }

  /** Validated transactions whose `expiresAt` has passed and are not yet
   * expired-out (§7.5) — the expiry scheduler's scan. */
  async findExpirable(tenantId: string, asOf: Date, limit = 500): Promise<PointTransaction[]> {
    return this.prisma.pointTransaction.findMany({
      where: { tenantId, status: 'VALIDATED', type: 'EARN', expiresAt: { lte: asOf } },
      take: limit,
    });
  }

  /** Cross-tenant negative test entry point — reads scoped by BOTH ids like
   * every other method here; kept explicit for the isolation test's clarity. */
  async findByIdAcrossTenant(tenantId: string, id: string): Promise<PointTransaction | null> {
    return this.prisma.pointTransaction.findFirst({ where: { id, tenantId } });
  }
}
