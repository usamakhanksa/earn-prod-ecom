import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { postLedgerCorrectionSchema, resolveDisputeSchema } from '@omnisell/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { FinancePayoutRepository } from '../repositories/finance-payout.repository';
import { FinanceDisputeService } from './finance-dispute.service';
import { LedgerService } from '../points/ledger.service';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * Admin finance ops (Phase 6, task 6.11) — platform-wide reconciliation
 * board, disputes register, and cross-tenant ledger corrections. Follows
 * `AdminOrderExceptionsController`'s exact pattern: `AdminOnlyGuard`, no
 * `TenantContextGuard`, real cross-tenant repository queries — never a
 * fabricated aggregate.
 */
@Controller('admin/finance')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminFinanceController {
  constructor(
    private readonly payouts: FinancePayoutRepository,
    private readonly disputes: FinanceDisputeService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('reconciliation-board')
  async reconciliationBoard() {
    return this.payouts.listVarianceFlaggedForAdmin();
  }

  @Get('disputes')
  async listDisputes(@Query('status') status?: string) {
    return this.disputes.listAllForAdmin(status);
  }

  @Post('disputes/:id/resolve')
  async resolveDispute(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const input = resolveDisputeSchema.parse(body);
    const dispute = await this.disputes.resolveForAdmin(id, input.status, req.user.userId, input.note);
    await this.audit.record({ actorId: req.user.userId, action: 'admin.finance_dispute_resolved', entityType: 'FinanceDispute', entityId: id, after: dispute });
    return dispute;
  }

  /** Cross-tenant manual ledger correction — the tenant is named explicitly
   * in the path since an admin acts on behalf of the platform, not from
   * inside any one tenant's own session context. */
  @Post('tenants/:tenantId/ledger-corrections')
  async postCorrection(@Req() req: AuthenticatedRequest, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    const input = postLedgerCorrectionSchema.parse(body);
    const entry = await this.ledger.postManualCorrection({
      tenantId,
      memo: input.memo,
      reasonCode: input.reasonCode,
      actorId: req.user.userId,
      lines: input.lines.map((l) => ({ accountCode: l.accountCode, direction: l.direction, amountMinor: BigInt(l.amountMinor), currencyCode: l.currencyCode })),
    });
    await this.audit.record({ tenantId, actorId: req.user.userId, action: 'admin.finance_ledger_correction', entityType: 'LedgerEntry', entityId: entry.id, after: entry });
    return entry;
  }
}
