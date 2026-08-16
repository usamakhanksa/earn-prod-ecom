import { Injectable } from '@nestjs/common';
import type { Invite } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Invite repository (prompt.md Phase 1.6 / featureslist.md 1.10). Every
 * tenant-known query (create, list, revoke) goes through here. The one
 * deliberate exception is acceptance-by-token (`InviteService.accept`), which
 * looks the row up directly via `prisma.invite.findUnique({ where: { tokenHash }})`
 * — the accepting caller does not know the tenant yet, exactly like
 * `AuthService` looks up `PasswordResetToken`/`EmailVerificationToken` directly
 * rather than through a repository. The opaque, unguessable token IS the
 * authorization boundary for that one lookup.
 */
@Injectable()
export class InviteRepository extends TenantScopedRepository<Pick<PrismaService, 'invite'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: {
    tenantId: string;
    email: string;
    role: string;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
  }): Promise<Invite> {
    return this.prisma.invite.create({ data });
  }

  async listForTenant(tenantId: string): Promise<Invite[]> {
    return this.prisma.invite.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findActivePending(tenantId: string, email: string): Promise<Invite | null> {
    return this.prisma.invite.findFirst({ where: { tenantId, email, status: 'PENDING' } });
  }

  async findById(tenantId: string, inviteId: string): Promise<Invite | null> {
    return this.prisma.invite.findFirst({ where: { id: inviteId, tenantId } });
  }

  async updateStatus(tenantId: string, inviteId: string, status: string): Promise<Invite> {
    return this.prisma.invite.update({ where: { id: inviteId, tenantId }, data: { status } });
  }

  async reissue(tenantId: string, inviteId: string, tokenHash: string, expiresAt: Date): Promise<Invite> {
    return this.prisma.invite.update({ where: { id: inviteId, tenantId }, data: { tokenHash, expiresAt } });
  }
}
