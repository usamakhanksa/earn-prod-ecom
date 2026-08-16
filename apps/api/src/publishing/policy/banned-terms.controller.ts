import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { BannedTermView } from '@omnisell/shared';
import { createBannedTermSchema, updateBannedTermSchema } from '@omnisell/shared';
import { BannedTermsService } from './banned-terms.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/tenant-context.guard';
import { AdminOnlyGuard } from '../../admin/admin-only.guard';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { SkipAuditLog } from '../../audit/skip-audit-log.decorator';

/**
 * Banned-term dictionary (featureslist.md 5.15, implentationplanphase.md
 * task 4.11) — GLOBAL, same admin-only-write / everyone-can-read split as
 * `ConnectorsController` (see that file's doc comment): every tenant is
 * linted against the identical dictionary, so only a platform admin edits it.
 */
@Controller()
export class BannedTermsController {
  constructor(
    private readonly bannedTerms: BannedTermsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('banned-terms')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  async list(): Promise<BannedTermView[]> {
    return this.bannedTerms.listActive();
  }

  @Get('admin/banned-terms')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  async adminList(): Promise<BannedTermView[]> {
    return this.bannedTerms.adminListAll();
  }

  @Post('admin/banned-terms')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminCreate(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BannedTermView> {
    const input = createBannedTermSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'banned_term.create', key: idempotencyKey, ownerId: userId, requestBody: input },
      async () => ({ status: 201, body: await this.bannedTerms.adminCreate(input, userId) }),
    );
    return result.body;
  }

  @Patch('admin/banned-terms/:id')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminUpdate(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown): Promise<BannedTermView> {
    const input = updateBannedTermSchema.parse(body);
    return this.bannedTerms.adminUpdate(id, input, userId);
  }

  @Delete('admin/banned-terms/:id')
  @UseGuards(JwtAuthGuard, AdminOnlyGuard)
  @SkipAuditLog()
  async adminDelete(@CurrentUserId() userId: string, @Param('id') id: string): Promise<{ ok: true }> {
    await this.bannedTerms.adminDelete(id, userId);
    return { ok: true };
  }
}
