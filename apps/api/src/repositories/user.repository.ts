import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'locale' | 'emailVerifiedAt' | 'createdAt'>;

const PUBLIC_SELECT = { id: true, email: true, name: true, locale: true, emailVerifiedAt: true, createdAt: true } as const;

/**
 * User repository, scoped through the tenant's memberships (Phase 1.5/1.6 —
 * member-management UI never queries `User` directly by id across tenants).
 * Mirrors the RLS `self_or_tenant_peer` policy on `User` (infra/db/rls.sql).
 */
@Injectable()
export class UserRepository extends TenantScopedRepository<Pick<PrismaService, 'user'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async listForTenant(tenantId: string): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      where: { memberships: { some: { tenantId, isActive: true } } },
      select: PUBLIC_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findInTenant(tenantId: string, userId: string): Promise<PublicUser | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, memberships: { some: { tenantId, isActive: true } } },
      select: PUBLIC_SELECT,
    });
  }
}
