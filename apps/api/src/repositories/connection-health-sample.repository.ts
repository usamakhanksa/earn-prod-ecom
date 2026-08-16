import { Injectable } from '@nestjs/common';
import type { ConnectionHealthSample, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class ConnectionHealthSampleRepository extends TenantScopedRepository<Pick<PrismaService, 'connectionHealthSample'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async record(data: Prisma.ConnectionHealthSampleUncheckedCreateInput): Promise<ConnectionHealthSample> {
    return this.prisma.connectionHealthSample.create({ data });
  }

  async recentForConnection(tenantId: string, connectionId: string, limit = 20): Promise<ConnectionHealthSample[]> {
    return this.prisma.connectionHealthSample.findMany({
      where: { tenantId, connectionId },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
  }
}
