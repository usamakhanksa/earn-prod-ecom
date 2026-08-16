import { describe, expect, it, vi } from 'vitest';
import { WalletRepository } from '../src/repositories/wallet.repository';

/**
 * Cross-tenant negative test (prompt.md #4 — Phase 1 gate), unit level.
 * Proves the repository ALWAYS injects the caller's tenantId — a repository that lets a
 * controller read another tenant's wallet is a compile/runtime failure.
 */
describe('WalletRepository tenancy enforcement', () => {
  function createRepo(prisma: { wallet: { findFirst: unknown; findUnique: unknown; create: unknown }; pointTransaction: { findMany: unknown } }) {
    const repo = new WalletRepository(prisma as never);
    repo.callerUserId = 'user-1';
    return repo;
  }

  it('injects tenantId on findForUser', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repo = createRepo({ wallet: { findFirst, findUnique: vi.fn(), create: vi.fn() }, pointTransaction: { findMany: vi.fn() } });

    await repo.findForUser('tenant-A', 'user-1');
    expect(findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-A', userId: 'user-1' } });
  });

  it('injects tenantId on findById (wallet of tenant B cannot be read via tenant A)', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const repo = createRepo({ wallet: { findFirst: vi.fn(), findUnique, create: vi.fn() }, pointTransaction: { findMany: vi.fn() } });

    const wallet = { id: 'w-b', tenantId: 'tenant-B', userId: 'user-2' };
    await repo.findById('tenant-A', wallet.id);
    const [{ where }] = findUnique.mock.calls[0] ?? [];
    expect(where).toEqual({ id: wallet.id, tenantId: 'tenant-A' });
  });

  it('history is tenant-pinned to the wallet owner', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'w', tenantId: 'tenant-A', userId: 'user-1', balance: 0n, version: 1 });
    const repo = createRepo({ wallet: { findFirst: vi.fn(), findUnique, create: vi.fn() }, pointTransaction: { findMany } });

    await repo.getBalanceAndHistory('tenant-A', 'w');
    const [args] = findMany.mock.calls[0] ?? [];
    expect(args.where).toMatchObject({ walletId: 'w', tenantId: 'tenant-A' });
  });
});