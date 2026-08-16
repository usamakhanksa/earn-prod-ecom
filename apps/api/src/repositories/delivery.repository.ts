import { Injectable } from '@nestjs/common';
import type { DeliveryLog, DeliveryToken, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Signed-URL delivery grants + the delivery log (task 5.10/7.2/7.5). The
 * bearer token itself is NEVER persisted — only its sha256 (`tokenHash`),
 * same secret-at-rest discipline as the Phase 3 credential vault. */
@Injectable()
export class DeliveryRepository extends TenantScopedRepository<Pick<PrismaService, 'deliveryToken'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createToken(input: Prisma.DeliveryTokenUncheckedCreateInput): Promise<DeliveryToken> {
    return this.prisma.deliveryToken.create({ data: input });
  }

  async findTokenByHash(tokenHash: string) {
    return this.prisma.deliveryToken.findUnique({
      where: { tokenHash },
      include: { entitlement: true, digitalFileVersion: true },
    });
  }

  async incrementDownloadCount(id: string): Promise<DeliveryToken> {
    return this.prisma.deliveryToken.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
  }

  async revokeToken(tenantId: string, id: string): Promise<DeliveryToken | null> {
    const existing = await this.prisma.deliveryToken.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.deliveryToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async listTokensForEntitlement(tenantId: string, entitlementId: string): Promise<DeliveryToken[]> {
    return this.prisma.deliveryToken.findMany({ where: { tenantId, entitlementId }, orderBy: { createdAt: 'desc' } });
  }

  async createLog(input: Prisma.DeliveryLogUncheckedCreateInput): Promise<DeliveryLog> {
    return this.prisma.deliveryLog.create({ data: input });
  }

  async listLogsForEntitlement(tenantId: string, entitlementId: string): Promise<DeliveryLog[]> {
    return this.prisma.deliveryLog.findMany({ where: { tenantId, entitlementId }, orderBy: { createdAt: 'desc' } });
  }

  async listLogs(tenantId: string, cursor: string | undefined, limit: number): Promise<{ items: DeliveryLog[]; nextCursor: string | null }> {
    const rows = await this.prisma.deliveryLog.findMany({
      where: { tenantId },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor !== undefined ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last !== undefined ? last.id : null };
  }
}
