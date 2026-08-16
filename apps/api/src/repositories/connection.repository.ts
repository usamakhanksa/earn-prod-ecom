import { Injectable } from '@nestjs/common';
import type { Connection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ConnectionRepository extends TenantScopedRepository<Pick<PrismaService, 'connection'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: Prisma.ConnectionUncheckedCreateInput): Promise<Connection> {
    return this.prisma.connection.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Connection | null> {
    return this.prisma.connection.findFirst({ where: { id, tenantId } });
  }

  async list(tenantId: string): Promise<Connection[]> {
    return this.prisma.connection.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Phase 5 — the ONE legitimate untenanted lookup this repository exposes:
   * an inbound provider webhook (`OrderWebhooksController`) carries no
   * OmniSell tenant context at all, so `connectionId` itself (embedded in
   * the per-tenant callback URL the tenant registered with the provider) is
   * the trust anchor that RESOLVES the tenant — mirroring how
   * `ConnectorOAuthState` resolves tenant/connection from its own state
   * token rather than a caller-supplied header (docs/OPEN_QUESTIONS.md #27).
   * Every subsequent read in the webhook path goes back through the normal
   * tenant-scoped methods once the tenantId is known.
   */
  async findTenantIdById(connectionId: string): Promise<string | null> {
    const row = await this.prisma.connection.findUnique({ where: { id: connectionId }, select: { tenantId: true } });
    return row?.tenantId ?? null;
  }

  async update(tenantId: string, id: string, data: Prisma.ConnectionUpdateInput): Promise<Connection | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.connection.update({ where: { id }, data });
  }
}
