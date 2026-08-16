import { describe, expect, it, vi } from 'vitest';
import { StripeBillingService } from '../src/finance/billing/stripe-billing.service';
import type { SubscriptionRepository } from '../src/repositories/subscription.repository';
import type { PlanRepository } from '../src/repositories/plan.repository';
import type { TenantRepository } from '../src/repositories/tenant.repository';
import type { AiCreditService } from '../src/finance/billing/ai-credit.service';

// STRIPE_SECRET_KEY is unset in this sandbox by design (docs/DEBT.md) — every
// test here exercises the real, honest "not Stripe-synced" local-state path,
// the only path actually reachable without live Stripe credentials.
describe('StripeBillingService (no STRIPE_SECRET_KEY — the real state of this sandbox)', () => {
  function makeService() {
    const subscriptions = {
      findForTenant: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'sub-1', ...data })),
      update: vi.fn().mockImplementation((_tenantId, data) => Promise.resolve({ id: 'sub-1', ...data })),
      recordUsage: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'usage-1', ...data })),
    };
    const plans = { findBySlug: vi.fn().mockResolvedValue({ id: 'plan-1', slug: 'pro', stripePriceId: null, aiCreditsIncluded: 500 }), listActive: vi.fn() };
    const tenants = { findById: vi.fn().mockResolvedValue({ name: 'Test Tenant' }) };
    const aiCredits = { grant: vi.fn().mockResolvedValue({ id: 'credit-1' }) };
    const service = new StripeBillingService(
      subscriptions as unknown as SubscriptionRepository,
      plans as unknown as PlanRepository,
      tenants as unknown as TenantRepository,
      aiCredits as unknown as AiCreditService,
    );
    return { service, subscriptions, plans, aiCredits };
  }

  it('reports itself as not configured', () => {
    const { service } = makeService();
    expect(service.isConfigured()).toBe(false);
  });

  it('subscribe creates a real local Subscription row and grants the plan\'s AI credits, honestly marked stripeSynced: false', async () => {
    const { service, subscriptions, aiCredits } = makeService();
    const result = await service.subscribe('t1', 'pro');
    expect(result.stripeSynced).toBe(false);
    expect(subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', planId: 'plan-1', stripeCustomerId: null, stripeSubscriptionId: null }));
    expect(aiCredits.grant).toHaveBeenCalledWith('t1', 'sub-1', 500, 'PLAN_GRANT');
  });

  it('subscribe refuses a duplicate subscription', async () => {
    const { service, subscriptions } = makeService();
    subscriptions.findForTenant.mockResolvedValue({ id: 'existing' });
    await expect(service.subscribe('t1', 'pro')).rejects.toThrow(/already has a subscription/);
  });

  it('cancel sets cancelAtPeriodEnd locally without a live Stripe call', async () => {
    const { service, subscriptions } = makeService();
    subscriptions.findForTenant.mockResolvedValue({ id: 'sub-1', stripeSubscriptionId: null });
    const result = await service.cancel('t1');
    expect(result.stripeSynced).toBe(false);
    expect(subscriptions.update).toHaveBeenCalledWith('t1', { cancelAtPeriodEnd: true });
  });

  it('recordUsage stores a real UsageRecord row without a live Stripe meter event', async () => {
    const { service, subscriptions } = makeService();
    subscriptions.findForTenant.mockResolvedValue({ id: 'sub-1', stripeCustomerId: null });
    const result = await service.recordUsage('t1', 'AI_CREDIT', 5);
    expect(result.stripeSynced).toBe(false);
    expect(subscriptions.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', kind: 'AI_CREDIT', quantity: 5, stripeUsageRecordId: null }));
  });
});
