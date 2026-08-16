import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AiCreditLedger } from '@prisma/client';
import { SubscriptionRepository } from '../../repositories/subscription.repository';

/**
 * AI credit ledger (Phase 6, task 6.10 — `Subscription ─── UsageRecord ───
 * AiCreditLedger` per prompt.md's data model). Append-only: every grant or
 * spend is a new row carrying its own `balanceAfter`, never an
 * update-in-place counter — the same "derived, not mutated" discipline
 * `Wallet.balance` already uses for points (Phase 4.5).
 */
@Injectable()
export class AiCreditService {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async getBalance(tenantId: string): Promise<number> {
    return this.subscriptions.lastAiCreditBalance(tenantId);
  }

  async grant(tenantId: string, subscriptionId: string | null, amount: number, reason: string): Promise<AiCreditLedger> {
    if (amount <= 0) {
      throw new Error('AI credit grant amount must be positive');
    }
    const balance = await this.subscriptions.lastAiCreditBalance(tenantId);
    return this.subscriptions.postAiCreditEntry({ tenantId, subscriptionId, delta: amount, balanceAfter: balance + amount, reason });
  }

  /** Spends credits for a real AI feature call (AI copy/tags/translate/
   * bg-remove/upscale, prompt.md's `/ai/*` surface) — refuses (real 403,
   * never a silent overdraft) when the balance is insufficient. */
  async spend(tenantId: string, amount: number, reason: string, refType?: string, refId?: string): Promise<AiCreditLedger> {
    if (amount <= 0) {
      throw new Error('AI credit spend amount must be positive');
    }
    const balance = await this.subscriptions.lastAiCreditBalance(tenantId);
    if (balance < amount) {
      throw new ForbiddenException({ message: `Insufficient AI credits: balance ${balance}, requested ${amount}`, code: 'AI_CREDITS_INSUFFICIENT' });
    }
    return this.subscriptions.postAiCreditEntry({
      tenantId,
      delta: -amount,
      balanceAfter: balance - amount,
      reason,
      refType: refType ?? null,
      refId: refId ?? null,
    });
  }

  async history(tenantId: string, limit = 100): Promise<AiCreditLedger[]> {
    return this.subscriptions.listAiCreditHistory(tenantId, limit);
  }
}
