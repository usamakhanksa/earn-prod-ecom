import { Injectable } from '@nestjs/common';
import type { Credential, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Every write here is ciphertext-in — see `CredentialVaultService`, the only
 * caller allowed to touch plaintext, and only for the duration of one call. */
@Injectable()
export class CredentialRepository extends TenantScopedRepository<Pick<PrismaService, 'credential'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.CredentialUncheckedCreateInput): Promise<Credential> {
    return this.prisma.credential.create({ data });
  }

  async findActiveForConnection(tenantId: string, connectionId: string): Promise<Credential | null> {
    return this.prisma.credential.findFirst({
      where: { tenantId, connectionId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivateAllForConnection(tenantId: string, connectionId: string): Promise<void> {
    await this.prisma.credential.updateMany({ where: { tenantId, connectionId, isActive: true }, data: { isActive: false } });
  }

  async findExpiringSoon(beforeDate: Date): Promise<Credential[]> {
    // Cross-tenant by nature — the token-refresh worker sweeps ALL tenants'
    // expiring OAuth credentials, so this deliberately bypasses the
    // withTenantContext helper (there is no single tenant context for a
    // platform-wide sweep). Each refreshed row is still written back through
    // the tenant-scoped `update` below, keyed by its own tenantId.
    return this.prisma.credential.findMany({
      where: { isActive: true, kind: 'OAUTH2', expiresAt: { lte: beforeDate } },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.CredentialUpdateInput): Promise<Credential | null> {
    const existing = await this.prisma.credential.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.credential.update({ where: { id }, data });
  }
}
