import { Injectable, Logger } from '@nestjs/common';
import type { NotificationSummary, PaginationQuery, Page } from '@omnisell/shared';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

export interface DispatchInput {
  tenantId: string;
  userId: string;
  type: 'SECURITY' | 'TEAM' | 'BILLING' | 'SYSTEM';
  title: string;
  body: string;
  data?: unknown;
  /** Email is opt-in per dispatch — most SYSTEM/TEAM chatter should stay in-app only. */
  email?: { subject: string; html?: string };
}

/**
 * Notification centre skeleton (prompt.md Phase 1.12 / docs/DEBT.md 1-D6).
 *
 * Dispatches to two transports today: an in-app `Notification` row (always,
 * unless the user opted out via `NotificationPreference.inApp`) and — when the
 * caller supplies `email` content and the user hasn't opted out — a transactional
 * email via the existing `MailerService`/Mailpit pipeline. Realtime delivery
 * (WebSocket/SSE push so an open tab updates without a refresh) is explicitly
 * OUT of scope for this pass; `GET /v1/notifications` is poll-based, matching
 * how the sidebar badge counts are documented (featureslist.md §0.1 — "poll
 * every 60s via SSE" is the eventual target, tracked as new debt below).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly mailer: MailerService,
    private readonly prisma: PrismaService,
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    const prefs = await this.preferences.resolve(input.tenantId, input.userId, input.type);

    if (prefs.inApp) {
      await this.notifications.create({
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
      });
    }

    if (prefs.email && input.email !== undefined) {
      const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
      if (user !== null) {
        await this.mailer.send({
          to: user.email,
          subject: input.email.subject,
          text: input.body,
          ...(input.email.html !== undefined ? { html: input.email.html } : {}),
        });
      } else {
        this.logger.warn(`Notification dispatch: user ${input.userId} not found for email delivery`);
      }
    }
  }

  async listForUser(tenantId: string, userId: string, query: PaginationQuery): Promise<Page<NotificationSummary>> {
    const { items, nextCursor } = await this.notifications.listForUser(tenantId, userId, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
    return {
      items: items.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  async markRead(tenantId: string, userId: string, id: string): Promise<boolean> {
    const updated = await this.notifications.markRead(tenantId, userId, id);
    return updated !== null;
  }

  async getPreferences(tenantId: string, userId: string) {
    return this.preferences.listForUser(tenantId, userId);
  }

  async updatePreference(
    tenantId: string,
    userId: string,
    type: string,
    data: { inApp?: boolean; email?: boolean },
  ) {
    return this.preferences.upsert(tenantId, userId, type, data);
  }
}
