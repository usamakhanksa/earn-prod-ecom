import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrderExceptionRepository } from '../repositories/order-exception.repository';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../admin/admin-only.guard';

/**
 * Admin "Order Exceptions / SLA Breaches" board (featureslist.md 6.11's
 * "SLA timers + breach alerts", surface `A`) — platform-wide, not tenant-
 * scoped, following the exact same pattern as `AdminQueuesController`
 * (`admin/queues`): `AdminOnlyGuard`, no `TenantContextGuard`, a real
 * cross-tenant repository query rather than a fabricated aggregate.
 */
@Controller('admin/order-exceptions')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminOrderExceptionsController {
  constructor(private readonly exceptions: OrderExceptionRepository) {}

  @Get('breached')
  async listBreached() {
    return this.exceptions.listBreachedAcrossTenantsForAdmin(new Date());
  }
}
