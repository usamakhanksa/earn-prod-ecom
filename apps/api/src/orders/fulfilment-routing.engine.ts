import type { RoutingStrategy } from '@omnisell/shared';

export interface RoutingRuleInput {
  id: string;
  strategy: RoutingStrategy;
  priority: number;
  isActive: boolean;
  conditions: { regions?: string[]; connectorSlugs?: string[]; productIds?: string[] } | null;
}

export interface RoutingCandidate {
  connectionId: string;
  connectorSlug: string;
  /** Lower is better for CHEAPEST. */
  costMinor?: bigint;
  /** Lower is better for FASTEST (estimated production+ship days). */
  etaDays?: number;
  /** ISO-3166 country/region codes this provider fulfils well/from. */
  regions?: string[];
  /** True when the provider is confirmed in-stock for the requested SKU. */
  inStock?: boolean;
}

export interface RoutingContext {
  destinationRegion?: string;
  productId?: string;
}

export interface RoutingDecision {
  connectionId: string | null;
  connectorSlug: string | null;
  strategy: RoutingStrategy;
  ruleId: string | null;
  reason: string;
}

/**
 * Auto-routing rules (featureslist.md 6.4 / task 5.4). Pure function — no
 * I/O — evaluated in `priority` order (lower first); the first ACTIVE rule
 * whose `conditions` match the context wins, then its `strategy` picks a
 * winning candidate from the (already resolved) provider connections.
 * `MANUAL`/no match returns `connectionId: null` — the caller falls back to
 * whatever the user picks explicitly, never a silent guess.
 */
export function resolveRouting(
  rules: RoutingRuleInput[],
  candidates: RoutingCandidate[],
  ctx: RoutingContext,
): RoutingDecision {
  if (candidates.length === 0) {
    return { connectionId: null, connectorSlug: null, strategy: 'MANUAL', ruleId: null, reason: 'No connected fulfilment provider is available' };
  }

  const sortedRules = [...rules].filter((r) => r.isActive).sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!ruleMatches(rule, ctx)) {
      continue;
    }
    const eligible = rule.conditions?.connectorSlugs !== undefined
      ? candidates.filter((c) => rule.conditions?.connectorSlugs?.includes(c.connectorSlug) === true)
      : candidates;
    if (eligible.length === 0) {
      continue;
    }
    const winner = pickByStrategy(rule.strategy, eligible, ctx);
    if (winner !== null) {
      return {
        connectionId: winner.connectionId,
        connectorSlug: winner.connectorSlug,
        strategy: rule.strategy,
        ruleId: rule.id,
        reason: `Matched routing rule (${rule.strategy})`,
      };
    }
  }

  return { connectionId: null, connectorSlug: null, strategy: 'MANUAL', ruleId: null, reason: 'No active routing rule matched — manual provider choice required' };
}

function ruleMatches(rule: RoutingRuleInput, ctx: RoutingContext): boolean {
  const regions = rule.conditions?.regions;
  if (regions !== undefined && regions.length > 0 && ctx.destinationRegion !== undefined && !regions.includes(ctx.destinationRegion)) {
    return false;
  }
  const productIds = rule.conditions?.productIds;
  if (productIds !== undefined && productIds.length > 0 && ctx.productId !== undefined && !productIds.includes(ctx.productId)) {
    return false;
  }
  return true;
}

function pickByStrategy(strategy: RoutingStrategy, candidates: RoutingCandidate[], ctx: RoutingContext): RoutingCandidate | null {
  switch (strategy) {
    case 'CHEAPEST': {
      const priced = candidates.filter((c) => c.costMinor !== undefined);
      if (priced.length === 0) return null;
      return priced.reduce((best, c) => (c.costMinor! < best.costMinor! ? c : best));
    }
    case 'FASTEST': {
      const timed = candidates.filter((c) => c.etaDays !== undefined);
      if (timed.length === 0) return null;
      return timed.reduce((best, c) => (c.etaDays! < best.etaDays! ? c : best));
    }
    case 'BY_REGION': {
      if (ctx.destinationRegion === undefined) return null;
      const matching = candidates.filter((c) => c.regions?.includes(ctx.destinationRegion!) === true);
      return matching[0] ?? null;
    }
    case 'BY_STOCK_PROVIDER': {
      const inStock = candidates.filter((c) => c.inStock === true);
      return inStock[0] ?? null;
    }
    case 'MANUAL':
    default:
      return null;
  }
}
