import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, Wallet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Wallet repository — every read/write is forced through tenantId. Used by the
 * Phase 4.5 wallet service and by the cross-tenant negative test (Phase 1 gate).
 */
@Injectable()
export class WalletRepository extends TenantScopedRepository<Pick<PrismaService, 'wallet'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async findForUser(tenantId: string, userId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: { tenantId, userId },
    });
  }

  async findById(tenantId: string, walletId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { id: walletId, tenantId },
    });
  }

  async createForUser(tenantId: string, userId: string): Promise<Wallet> {
    return this.prisma.wallet.create({ data: { tenantId, userId, balance: 0n, version: 1 } });
  }

  /** Lazily creates the wallet on first touch — a consumer landing in Consumer
   * Mode with no prior activity still gets a real (zero-balance) Wallet row,
   * never a fabricated in-memory `{balance: 0}` (docs/points-extension.md §13). */
  async findOrCreateForUser(tenantId: string, userId: string, client: Client = this.prisma): Promise<Wallet> {
    const existing = await client.wallet.findFirst({ where: { tenantId, userId } });
    if (existing !== null) {
      return existing;
    }
    return client.wallet.create({ data: { tenantId, userId, balance: 0n, version: 1 } });
  }

  /**
   * Optimistic-concurrency (CAS) balance write (§3.5/§6.2). `expectedVersion`
   * must match the row currently in the DB or the update touches zero rows —
   * `updateMany` (not `update`) is used deliberately so a version mismatch is
   * a normal `{count: 0}` result the caller can react to, not a thrown
   * "record not found" from Prisma's unique-`where` update path.
   */
  async casUpdateBalance(
    tenantId: string,
    walletId: string,
    expectedVersion: number,
    newBalance: bigint,
    client: Client = this.prisma,
  ): Promise<Wallet> {
    const result = await client.wallet.updateMany({
      where: { id: walletId, tenantId, version: expectedVersion },
      data: { balance: newBalance, version: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new ConflictException({
        message: 'Wallet was updated concurrently — retry the operation',
        code: 'POINTS_WALLET_VERSION_CONFLICT',
      });
    }
    const updated = await client.wallet.findFirst({ where: { id: walletId, tenantId } });
    if (updated === null) {
      throw new ConflictException({ message: 'Wallet disappeared mid-transaction', code: 'POINTS_WALLET_VERSION_CONFLICT' });
    }
    return updated;
  }

  /** Wallet + full validated transaction history, tenant-pinned at the query level. */
  async getBalanceAndHistory(tenantId: string, walletId: string) {
    const wallet = await this.findById(tenantId, walletId);
    if (wallet === null) {
      return null;
    }
    const transactions = await this.prisma.pointTransaction.findMany({
      where: { walletId: wallet.id, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { wallet, transactions };
  }
}