import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WalletRepository } from '../../src/repositories/wallet.repository';

/**
 * Phase 1 gate — cross-tenant reads MUST fail at the RLS layer.
 * Requires the docker-compose stack (gated by test:integration; CI runs this).
 * Creates tenants A & B, writes each its own wallet through the repository with the
 * RLS session variable set, then asserts tenant A cannot read tenant B's wallet.
 */
describe('RLS cross-tenant isolation (integration)', () => {
  it.skipIf((process.env.E2E ?? '0') !== '1')('rejects reads outside the caller tenant', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();

    const repo = new WalletRepository(prisma);

    try {
      const a = await prisma.tenant.create({ data: { slug: `t-${Date.now()}-a`, name: 'Tenant A' } });
      const b = await prisma.tenant.create({ data: { slug: `t-${Date.now()}-b`, name: 'Tenant B' } });

      const walletA = await prisma.wallet.create({ data: { tenantId: a.id, userId: 'u-a', balance: 0n, version: 1 } });
      await prisma.wallet.create({ data: { tenantId: b.id, userId: 'u-b', balance: 500n, version: 1 } });

      // Inside an RLS-scoped tenant-A context, tenant B's wallet is invisible.
      const readAsA = await repo.withTenantContext(a.id, async (tx) =>
        tx.wallet.findMany({ where: { userId: 'u-b' } }),
      );

      expect(walletA.id.length).toBeGreaterThan(0);
      expect(readAsA).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it.skipIf((process.env.E2E ?? '0') !== '1')('hides another tenant membership even for the same user id', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    const repo = new WalletRepository(prisma);

    try {
      const a = await prisma.tenant.create({ data: { slug: `t-${Date.now()}-ma`, name: 'Tenant A' } });
      const b = await prisma.tenant.create({ data: { slug: `t-${Date.now()}-mb`, name: 'Tenant B' } });
      const user = await prisma.user.create({
        data: { email: `shared-${Date.now()}@demo.test`, passwordHash: 'x' },
      });
      await prisma.membership.create({ data: { tenantId: a.id, userId: user.id, role: 'OWNER' } });
      await prisma.membership.create({ data: { tenantId: b.id, userId: user.id, role: 'MEMBER' } });

      const membershipsAsA = await repo.withTenantContext(a.id, async (tx) =>
        tx.membership.findMany({ where: { userId: user.id } }),
      );

      // Only the tenant-A membership row is visible under tenant A's RLS context,
      // even though the same user also holds a membership in tenant B.
      expect(membershipsAsA).toHaveLength(1);
      expect(membershipsAsA[0]?.tenantId).toBe(a.id);
    } finally {
      await prisma.$disconnect();
    }
  });

  it.skipIf((process.env.E2E ?? '0') !== '1')('exposes a user to tenant peers but not to strangers', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    const repo = new WalletRepository(prisma);

    try {
      const a = await prisma.tenant.create({ data: { slug: `t-${Date.now()}-ua`, name: 'Tenant A' } });
      const stranger = await prisma.tenant.create({ data: { slug: `t-${Date.now()}-us`, name: 'Stranger Co' } });
      const member = await prisma.user.create({
        data: { email: `member-${Date.now()}@demo.test`, passwordHash: 'x' },
      });
      await prisma.membership.create({ data: { tenantId: a.id, userId: member.id, role: 'MEMBER' } });

      const visibleToPeer = await repo.withTenantContext(a.id, async (tx) =>
        tx.user.findUnique({ where: { id: member.id } }),
      );
      const visibleToStranger = await repo.withTenantContext(stranger.id, async (tx) =>
        tx.user.findUnique({ where: { id: member.id } }),
      );

      expect(visibleToPeer?.id).toBe(member.id);
      expect(visibleToStranger).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });
});