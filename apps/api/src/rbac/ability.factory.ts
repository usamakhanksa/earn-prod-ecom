import { Injectable } from '@nestjs/common';
import { AbilityBuilder, PureAbility, type AbilityClass } from '@casl/ability';
import type { OrgRole } from '@omnisell/shared';
import type { Action } from './actions';
import type { Subject } from './subjects';

export type AppAbility = PureAbility<[Action, Subject]>;
const AppAbility = PureAbility as AbilityClass<AppAbility>;

/**
 * CASL ability factory (prompt.md Phase 1.4 — 7 org roles).
 *
 * This answers "can role R perform action A on resource type T at all". It is the
 * FIRST line of defence — coarse, type-level, route-guard authorization. Row-level
 * scoping (which tenant's rows, which user's own wallet) is enforced independently
 * by TenantScopedRepository + Postgres RLS (infra/db/rls.sql); CASL never sees a
 * concrete row here, so it intentionally does not encode per-row conditions.
 *
 * Conservative default (docs/OPEN_QUESTIONS.md): only OWNER can delete a Tenant;
 * ADMIN otherwise mirrors OWNER. DESIGNER/FINANCE/ANALYST/SUPPORT get read-most
 * plus their domain's write; MEMBER is the consumer-mode default (read catalog +
 * content, no admin surface). Revisit once prompt.md's exact matrix is available.
 */
@Injectable()
export class AbilityFactory {
  createForRole(role: OrgRole): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(AppAbility);

    switch (role) {
      case 'OWNER':
        can('manage', 'all');
        break;

      case 'ADMIN':
        can('manage', 'all');
        cannot('delete', 'Tenant');
        break;

      case 'DESIGNER':
        can('read', 'all');
        can(['create', 'update', 'delete'], [
          'Product',
          'VideoContent',
          'Asset',
          'Collection',
          'ProductVariant',
          'DesignPlacement',
          'MockupTemplate',
          // Phase 4 — DESIGNER composes/submits listings (brb.md §4 persona
          // table); approval decisions still require OWNER/ADMIN (the
          // closest existing role to brb.md's "Studio Manager" — see
          // docs/OPEN_QUESTIONS.md's MANAGER-role reconciliation note).
          'Listing',
          // Phase 5 — DESIGNER/ops submits fulfilment and manages digital
          // product files; refunds/reprint cost sign-off stay FINANCE-only.
          'Fulfilment',
          'DigitalProduct',
        ]);
        can(['create', 'update'], 'Order'); // hold/release/cancel from the feed
        can('update', 'OrderException');
        break;

      case 'FINANCE':
        can('read', 'all');
        can('update', ['PointEarningRule']);
        can(['create', 'update'], ['PricingRule']);
        // Redemption refunds (§7.4.3) are a finance-triggered correction —
        // never mutates a validated row, always a fresh reversing EARN.
        can('update', 'ProductPurchaseWithPoints');
        // Phase 5 — returns/refunds/reprints carry cost attribution to the
        // ledger (featureslist.md 6.8); coupons/licence keys are pricing
        // policy, same domain FINANCE already owns via PricingRule above.
        can(['create', 'update'], ['Return', 'Refund', 'Reprint', 'Coupon', 'LicenceKey', 'FulfilmentRoutingRule']);
        can('update', 'Order');
        // Phase 6 — Finance, Ledger & Tax is FINANCE's home domain: expense
        // approval, payout reconciliation, tax nexus config, period locks,
        // manual ledger corrections, dispute resolution, and the tenant's
        // own subscription are all finance-owned mutations. OWNER/ADMIN
        // (already `manage: 'all'`) can do the same; this just makes FINANCE
        // able to without needing OWNER/ADMIN.
        can(['create', 'update'], ['Expense', 'FinancePayout', 'Invoice', 'TaxNexus', 'PeriodLock', 'FinanceDispute', 'Subscription']);
        break;

      case 'ANALYST':
        can('read', 'all');
        break;

      case 'SUPPORT':
        can('read', ['Membership', 'Wallet', 'PointTransaction', 'VideoContent', 'AuditLog']);
        can('update', 'PointTransaction'); // manual point adjustments + fraud review (Phase 4.5 admin tool)
        // Phase 5 — exception queue triage + buyer messaging is a support desk task.
        can('read', ['Order', 'OrderException', 'Fulfilment', 'Entitlement']);
        can('update', 'OrderException');
        can(['create', 'update'], 'BuyerMessageTemplate');
        break;

      case 'MEMBER':
        can('read', ['Product', 'VideoContent']);
        break;
    }

    return build();
  }
}
