import { describe, expect, it, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { WalletService } from '../src/points/wallet.service';
import type { WalletRepository } from '../src/repositories/wallet.repository';
import type { PointTransactionRepository } from '../src/repositories/point-transaction.repository';
import type { TenantRepository } from '../src/repositories/tenant.repository';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

/**
 * Wallet service (docs/points-extension.md §3.5/§6.2, task 4.5.2/4.5.9):
 * derived balance, CAS writes, and the injected-corruption fail-closed test
 * §16's DoD explicitly requires.
 */
describe('WalletService.applyValidatedDelta — fail-closed reconciliation (§3.5)', () => {
  function makeService(derivedSum: bigint) {
    const wallets = { casUpdateBalance: vi.fn().mockResolvedValue({ id: 'w1', balance: 150n, version: 2 }) };
    const pointTransactions = { sumValidated: vi.fn().mockResolvedValue(derivedSum) };
    const service = new WalletService(
      wallets as unknown as WalletRepository,
      pointTransactions as unknown as PointTransactionRepository,
      {} as unknown as TenantRepository,
      {} as unknown as PrismaService,
      { record: vi.fn() } as unknown as AuditLogService,
    );
    return { service, wallets, pointTransactions };
  }

  const fakeTx = {
    wallet: { findFirst: vi.fn() },
  };

  it('commits the CAS update when the derivation matches the incrementally-computed balance', async () => {
    fakeTx.wallet.findFirst.mockResolvedValue({ id: 'w1', tenantId: 't1', balance: 100n, version: 1 });
    const { service, wallets } = makeService(150n); // 100 (cached) + 50 (delta) = 150, matches derivation
    const result = await service.applyValidatedDelta(fakeTx as never, 't1', 'w1', 50n);
    expect(wallets.casUpdateBalance).toHaveBeenCalledWith('t1', 'w1', 1, 150n, fakeTx);
    expect(result.balance).toBe(150n);
  });

  it('FAILS CLOSED (throws, never silently corrects) when the derivation does not match — injected corruption', async () => {
    fakeTx.wallet.findFirst.mockResolvedValue({ id: 'w1', tenantId: 't1', balance: 100n, version: 1 });
    // Derivation says 999 (e.g. a stray/duplicate VALIDATED row exists) while
    // the incrementally-expected value is 150 — a real corruption scenario.
    const { service, wallets } = makeService(999n);
    await expect(service.applyValidatedDelta(fakeTx as never, 't1', 'w1', 50n)).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(wallets.casUpdateBalance).not.toHaveBeenCalled(); // no write happens on mismatch
  });

  it('rejects when the wallet cannot be found inside the transaction', async () => {
    fakeTx.wallet.findFirst.mockResolvedValue(null);
    const { service } = makeService(0n);
    await expect(service.applyValidatedDelta(fakeTx as never, 't1', 'missing', 50n)).rejects.toThrow();
  });
});

describe('WalletService.getWalletView — derived projections', () => {
  it('reports todayCapped once today\'s earned total reaches the global daily cap', async () => {
    const wallets = { findOrCreateForUser: vi.fn().mockResolvedValue({ id: 'w1', tenantId: 't1', userId: 'u1', balance: 500n, version: 1 }) };
    const pointTransactions = {
      sumEarnedSince: vi.fn().mockResolvedValue(500n), // POINTS_DAILY_EARNING_CAP default is 500
    };
    const tenants = { findById: vi.fn().mockResolvedValue({ id: 't1', timezone: 'UTC' }) };
    const prisma = {
      pointTransaction: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 500n } }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new WalletService(
      wallets as unknown as WalletRepository,
      pointTransactions as unknown as PointTransactionRepository,
      tenants as unknown as TenantRepository,
      prisma as unknown as PrismaService,
      { record: vi.fn() } as unknown as AuditLogService,
    );
    const view = await service.getWalletView('t1', 'u1');
    expect(view.todayCapped).toBe(true);
    expect(view.balance).toBe('500');
  });
});
