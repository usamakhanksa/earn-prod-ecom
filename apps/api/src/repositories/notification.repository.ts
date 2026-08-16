import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class NotificationRepository extends TenantScopedRepository<Pick<PrismaService, 'notification'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(data: {
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: unknown;
    channel?: string;
  }): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: (data.data ?? null) as never,
        channel: data.channel ?? 'IN_APP',
      },
    });
  }

  /** Cursor-paginated, newest first — prompt.md API conventions. */
  async listForUser(
    tenantId: string,
    userId: string,
    params: { cursor?: string; limit: number },
  ): Promise<{ items: Notification[]; nextCursor: string | null }> {
    const items = await this.prisma.notification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > params.limit;
    const page = hasMore ? items.slice(0, params.limit) : items;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async markRead(tenantId: string, userId: string, id: string): Promise<Notification | null> {
    const existing = await this.prisma.notification.findFirst({ where: { id, tenantId, userId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
}
