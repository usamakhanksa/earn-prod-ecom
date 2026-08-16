import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { NotificationPreferenceSummary, NotificationSummary, Page } from '@omnisell/shared';
import { paginationQuerySchema, updateNotificationPreferenceSchema } from '@omnisell/shared';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';

/** In-app notification centre skeleton (prompt.md Phase 1.12). See
 * `NotificationService`'s doc comment for what is and isn't wired up yet. */
@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('notifications')
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: unknown): Promise<Page<NotificationSummary>> {
    const input = paginationQuerySchema.parse(query);
    return this.notifications.listForUser(tenant.tenantId, tenant.userId, input);
  }

  @Patch('notifications/:id/read')
  async markRead(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ read: true }> {
    const ok = await this.notifications.markRead(tenant.tenantId, tenant.userId, id);
    if (!ok) {
      throw new NotFoundException('Notification not found');
    }
    return { read: true };
  }

  @Get('preferences')
  async getPreferences(@CurrentTenant() tenant: TenantContext): Promise<NotificationPreferenceSummary[]> {
    const rows = await this.notifications.getPreferences(tenant.tenantId, tenant.userId);
    return rows.map((row) => ({ type: row.type, inApp: row.inApp, email: row.email }));
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ): Promise<NotificationPreferenceSummary> {
    const input = updateNotificationPreferenceSchema.parse(body);
    const row = await this.notifications.updatePreference(tenant.tenantId, tenant.userId, input.type, {
      ...(input.inApp !== undefined ? { inApp: input.inApp } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    });
    return { type: row.type, inApp: row.inApp, email: row.email };
  }
}
