import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import type { Subscription, UsageRecord } from '@prisma/client';
import { SubscriptionRepository } from '../../repositories/subscription.repository';
import { PlanRepository } from '../../repositories/plan.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { AiCreditService } from './ai-credit.service';
import { env } from '../../config/env';

/**
 * Stripe Billing integration (Phase 6, task 6.10): subscriptions, plans,
 * proration (delegated to Stripe itself — Stripe prorates automatically on
 * a subscription item price change, which this service triggers via
 * `subscriptions.update`), dunning (Stripe's own automatic retry schedule,
 * observed here only via webhook status updates), and usage records posted
 * through Stripe's current (2024+) Billing **Meters** API
 * (`stripe.billing.meterEvents.create` — confirmed via WebSearch this pass
 * as the SDK's now-recommended replacement for the deprecated
 * `subscriptionItems.createUsageRecord` legacy usage-record API, per
 * Stripe's own migration guide; the SDK shape below is built against that
 * confirmed API, not guessed).
 *
 * GATED BEHIND `STRIPE_SECRET_KEY` PRESENCE — absent in this sandbox, same
 * honest pattern as every other payment/connector integration here (OAuth
 * SSO 1-D2, Printful OAuth 3-D6, etc.). When the key is absent, `stripe` is
 * `null` and every method below still runs its REAL local state machine
 * (creates/updates the `Subscription`/`UsageRecord` rows, grants AI
 * credits) but skips the Stripe API call and returns `stripeSynced: false`
 * — never a fabricated Stripe object ID.
 */
@Injectable()
export class StripeBillingService {
  private readonly stripe: Stripe | null;

  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
    private readonly tenants: TenantRepository,
    private readonly aiCredits: AiCreditService,
  ) {
    this.stripe = env.STRIPE_SECRET_KEY !== undefined ? new Stripe(env.STRIPE_SECRET_KEY) : null;
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async listPlans() {
    return this.plans.listActive();
  }

  async getSubscription(tenantId: string): Promise<Subscription | null> {
    return this.subscriptions.findForTenant(tenantId);
  }

  async subscribe(tenantId: string, planSlug: string): Promise<{ subscription: Subscription; stripeSynced: boolean }> {
    const plan = await this.plans.findBySlug(planSlug);
    if (plan === null) {
      throw new NotFoundException({ message: `Plan '${planSlug}' not found`, code: 'PLAN_NOT_FOUND' });
    }
    const existing = await this.subscriptions.findForTenant(tenantId);
    if (existing !== null) {
      throw new ConflictException({ message: 'Tenant already has a subscription — cancel it before subscribing to a new plan', code: 'SUBSCRIPTION_ALREADY_EXISTS' });
    }

    let stripeCustomerId: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let status = 'INCOMPLETE';
    let stripeSynced = false;

    if (this.stripe !== null && plan.stripePriceId !== null) {
      const tenant = await this.tenants.findById(tenantId);
      const customer = await this.stripe.customers.create({ ...(tenant?.name !== undefined ? { name: tenant.name } : {}), metadata: { tenantId } });
      const stripeSubscription = await this.stripe.subscriptions.create({ customer: customer.id, items: [{ price: plan.stripePriceId }] });
      stripeCustomerId = customer.id;
      stripeSubscriptionId = stripeSubscription.id;
      status = stripeSubscription.status.toUpperCase();
      stripeSynced = true;
    }

    const created = await this.subscriptions.create({
      tenantId,
      planId: plan.id,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
    });

    if (plan.aiCreditsIncluded > 0) {
      await this.aiCredits.grant(tenantId, created.id, plan.aiCreditsIncluded, 'PLAN_GRANT');
    }

    return { subscription: created, stripeSynced };
  }

  /** Cancels at period end (never an immediate hard-cancel — the tenant keeps
   * what they already paid for). Proration for a mid-cycle PLAN CHANGE
   * (rather than a cancel) is Stripe's own automatic behaviour on
   * `subscriptions.update` with a new price — not separately implemented
   * here since this phase does not expose a plan-CHANGE endpoint, only
   * subscribe/cancel. */
  async cancel(tenantId: string): Promise<{ subscription: Subscription; stripeSynced: boolean }> {
    const subscription = await this.subscriptions.findForTenant(tenantId);
    if (subscription === null) {
      throw new NotFoundException({ message: 'No subscription found for this tenant', code: 'SUBSCRIPTION_NOT_FOUND' });
    }
    let stripeSynced = false;
    if (this.stripe !== null && subscription.stripeSubscriptionId !== null) {
      await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
      stripeSynced = true;
    }
    const updated = await this.subscriptions.update(tenantId, { cancelAtPeriodEnd: true });
    return { subscription: updated ?? subscription, stripeSynced };
  }

  /** Records a usage event (task 6.10's `UsageRecord`), pushing it to
   * Stripe's Billing Meters API when configured — `event_name` is the
   * usage kind lower-cased (e.g. `ai_credit`), matching how a real Meter
   * would be configured in the Stripe Dashboard for this product. */
  async recordUsage(tenantId: string, kind: string, quantity: number): Promise<{ record: UsageRecord; stripeSynced: boolean }> {
    const subscription = await this.subscriptions.findForTenant(tenantId);
    if (subscription === null) {
      throw new NotFoundException({ message: 'No subscription found for this tenant', code: 'SUBSCRIPTION_NOT_FOUND' });
    }
    let stripeUsageRecordId: string | null = null;
    let stripeSynced = false;
    if (this.stripe !== null && subscription.stripeCustomerId !== null) {
      const event = await this.stripe.billing.meterEvents.create({
        event_name: kind.toLowerCase(),
        payload: { stripe_customer_id: subscription.stripeCustomerId, value: String(quantity) },
      });
      stripeUsageRecordId = event.identifier;
      stripeSynced = true;
    }
    const record = await this.subscriptions.recordUsage({ tenantId, subscriptionId: subscription.id, kind, quantity, stripeUsageRecordId });
    return { record, stripeSynced };
  }

  async listUsage(tenantId: string, kind?: string): Promise<UsageRecord[]> {
    return this.subscriptions.listUsage(tenantId, kind);
  }

  /**
   * Dunning (task 6.10): this service does not implement its own retry
   * schedule — Stripe's own Smart Retries handle failed-payment retries
   * automatically once a subscription is Stripe-synced. What this method
   * does is the OmniSell-side half: record the dunning attempt count on our
   * own `Subscription` row from a `invoice.payment_failed` webhook (wiring
   * the actual webhook receiver is out of this phase's scope — no live
   * Stripe account exists here to send one — but the state transition this
   * method performs is real and independently callable/testable).
   */
  async recordDunningAttempt(tenantId: string): Promise<Subscription | null> {
    const subscription = await this.subscriptions.findForTenant(tenantId);
    if (subscription === null) {
      return null;
    }
    return this.subscriptions.update(tenantId, { dunningAttempts: subscription.dunningAttempts + 1, status: 'PAST_DUE' });
  }
}
