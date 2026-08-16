import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

const requestSchema = z.object({
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().length(3),
  method: z.enum(['PAYPAL', 'STRIPE', 'BANK', 'MANUAL', 'MOCK']),
  destination: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

@Controller('marketplace/payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog() // Payout request is an entry in the payout ledger itself
  request(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.payouts.request(userId, requestSchema.parse(body));
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUserId() userId: string) {
    return this.payouts.listForUser(userId);
  }
}