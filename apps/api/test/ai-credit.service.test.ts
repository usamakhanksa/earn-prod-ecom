import { describe, expect, it, vi } from 'vitest';
import { AiCreditService } from '../src/finance/billing/ai-credit.service';
import type { SubscriptionRepository } from '../src/repositories/subscription.repository';

function makeService(startingBalance = 0) {
  let balance = startingBalance;
  const subscriptions = {
    lastAiCreditBalance: vi.fn().mockImplementation(() => Promise.resolve(balance)),
    postAiCreditEntry: vi.fn().mockImplementation((data: { delta: number; balanceAfter: number }) => {
      balance = data.balanceAfter;
      return Promise.resolve({ id: 'entry-1', ...data });
    }),
    listAiCreditHistory: vi.fn().mockResolvedValue([]),
  };
  return { service: new AiCreditService(subscriptions as unknown as SubscriptionRepository), subscriptions };
}

describe('AiCreditService', () => {
  it('grants credits and increases the running balance', async () => {
    const { service } = makeService(0);
    const entry = await service.grant('t1', 'sub-1', 100, 'PLAN_GRANT');
    expect(entry.balanceAfter).toBe(100);
  });

  it('spends credits when the balance is sufficient', async () => {
    const { service } = makeService(100);
    const entry = await service.spend('t1', 40, 'AI_COPY_SPEND');
    expect(entry.balanceAfter).toBe(60);
  });

  it('refuses to spend more credits than are available (real 403, no silent overdraft)', async () => {
    const { service } = makeService(10);
    await expect(service.spend('t1', 40, 'AI_COPY_SPEND')).rejects.toThrow(/Insufficient AI credits/);
  });

  it('rejects a non-positive grant/spend amount', async () => {
    const { service } = makeService(10);
    await expect(service.grant('t1', null, 0, 'PLAN_GRANT')).rejects.toThrow();
    await expect(service.spend('t1', -5, 'AI_COPY_SPEND')).rejects.toThrow();
  });
});
