import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Payout } from '@prisma/client';
import type { PayoutDTO } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RequestPayoutInput {
  amountMinor: string; // decimal string of minor units (e.g. "2500" = 25.00)
  currency: string;
  method: string; // PAYPAL | STRIPE | BANK | MANUAL | MOCK
  destination?: string | undefined;
  idempotencyKey?: string | undefined;
}

/** Wallet / payouts (spec §22/§26). Payout eligibility is derived from
 * server-approved earnings only — never client-supplied balances. */
@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sum of the user's approved earnings (commissions + task/offer rewards). */
  private async approvedEarnings(userId: string): Promise<{ totalMinor: bigint; currency: string }> {
    const [commissionRows, taskRows, offerRows] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where: { affiliate: { userId }, status: { in: ['APPROVED', 'PAID'] } },
        select: { amountMinor: true, currency: true },
      }),
      this.prisma.taskCompletion.findMany({
        where: { userId, status: 'APPROVED' },
        select: { rewardMinor: true, currency: true },
      }),
      this.prisma.offerCompletion.findMany({
        where: { userId, status: 'APPROVED' },
        select: { rewardMinor: true, currency: true },
      }),
    ]);
    const all: Array<{ currency: string; amount: bigint }> = [
      ...commissionRows.map((c) => ({ currency: c.currency, amount: c.amountMinor })),
      ...taskRows.map((t) => ({ currency: t.currency, amount: t.rewardMinor })),
      ...offerRows.map((o) => ({ currency: o.currency, amount: o.rewardMinor })),
    ];
    const currency = all[0]?.currency ?? 'USD';
    const totalMinor = all
      .filter((e) => e.currency === currency)
      .reduce((acc, e) => acc + e.amount, 0n);
    return { totalMinor, currency };
  }

  async request(userId: string, input: RequestPayoutInput): Promise<PayoutDTO> {
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) {
      throw new BadRequestException('Payout amount must be positive');
    }
    const { totalMinor, currency } = await this.approvedEarnings(userId);
    // Payouts below the platform minimum are rejected server-side (spec §22).
    if (totalMinor < 1000n) {
      throw new BadRequestException('Minimum payout is 10.00 in the account currency');
    }
    if (amount > totalMinor) {
      throw new BadRequestException('Requested amount exceeds approved earnings');
    }

    const key = input.idempotencyKey ?? randomUUID();
    const existing = await this.prisma.payout.findUnique({ where: { idempotencyKey: key } });
    if (existing !== null) {
      return toDto(existing);
    }

    const payout = await this.prisma.payout.create({
      data: {
        userId,
        amountMinor: amount,
        currency,
        method: input.method,
        destination: input.destination ?? null,
        status: 'REQUESTED',
        idempotencyKey: key,
      },
    });
    return toDto(payout);
  }

  async listForUser(userId: string): Promise<{ items: PayoutDTO[] }> {
    const rows = await this.prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: rows.map(toDto) };
  }
}

function toDto(p: Payout): PayoutDTO {
  return {
    id: p.id,
    amountMinor: p.amountMinor.toString(),
    currency: p.currency,
    method: p.method,
    destination: p.destination,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}