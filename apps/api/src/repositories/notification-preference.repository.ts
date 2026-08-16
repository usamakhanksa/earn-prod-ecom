import { Injectable } from '@nestjs/common';
import type { NotificationPreference } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class NotificationPreferenceRepository extends TenantScopedRepository<
  Pick<PrismaService, 'notificationPreference'>
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async listForUser(tenantId: string, userId: string): Promise<NotificationPreference[]> {
    return this.prisma.notificationPreference.findMany({ where: { tenantId, userId } });
  }

  async upsert(
    tenantId: string,
    userId: string,
    type: string,
    data: { inApp?: boolean; email?: boolean },
  ): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { tenantId_userId_type: { tenantId, userId, type } },
      update: data,
      create: { tenantId, userId, type, inApp: data.inApp ?? true, email: data.email ?? true },
    });
  }

  /** Defaults (in-app + email both on) when no row has ever been written. */
  async resolve(tenantId: string, userId: string, type: string): Promise<{ inApp: boolean; email: boolean }> {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { tenantId_userId_type: { tenantId, userId, type } },
    });
    return { inApp: existing?.inApp ?? true, email: existing?.email ?? true };
  }
}
