import { describe, expect, it } from 'vitest';
import { resolveRouting, type RoutingCandidate, type RoutingRuleInput } from '../src/orders/fulfilment-routing.engine';

const candidates: RoutingCandidate[] = [
  { connectionId: 'c-printful', connectorSlug: 'printful', costMinor: 900n, etaDays: 4, regions: ['US'], inStock: true },
  { connectionId: 'c-printify', connectorSlug: 'printify', costMinor: 700n, etaDays: 6, regions: ['US', 'CA'], inStock: false },
  { connectionId: 'c-gelato', connectorSlug: 'gelato', costMinor: 1200n, etaDays: 2, regions: ['EU'], inStock: true },
];

describe('fulfilment routing engine (featureslist.md 6.4)', () => {
  it('CHEAPEST picks the lowest costMinor candidate', () => {
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'CHEAPEST', priority: 0, isActive: true, conditions: null }];
    const decision = resolveRouting(rules, candidates, {});
    expect(decision.connectionId).toBe('c-printify');
    expect(decision.strategy).toBe('CHEAPEST');
  });

  it('FASTEST picks the lowest etaDays candidate', () => {
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'FASTEST', priority: 0, isActive: true, conditions: null }];
    const decision = resolveRouting(rules, candidates, {});
    expect(decision.connectionId).toBe('c-gelato');
  });

  it('BY_REGION picks a candidate whose regions include the destination', () => {
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'BY_REGION', priority: 0, isActive: true, conditions: null }];
    const decision = resolveRouting(rules, candidates, { destinationRegion: 'CA' });
    expect(decision.connectionId).toBe('c-printify');
  });

  it('BY_STOCK_PROVIDER picks the first in-stock candidate', () => {
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'BY_STOCK_PROVIDER', priority: 0, isActive: true, conditions: null }];
    const decision = resolveRouting(rules, candidates, {});
    expect(decision.connectionId).toBe('c-printful');
  });

  it('evaluates rules in priority order and stops at the first match', () => {
    const rules: RoutingRuleInput[] = [
      { id: 'r-low-priority', strategy: 'CHEAPEST', priority: 5, isActive: true, conditions: null },
      { id: 'r-high-priority', strategy: 'FASTEST', priority: 0, isActive: true, conditions: null },
    ];
    const decision = resolveRouting(rules, candidates, {});
    expect(decision.ruleId).toBe('r-high-priority');
    expect(decision.connectionId).toBe('c-gelato');
  });

  it('skips inactive rules', () => {
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'CHEAPEST', priority: 0, isActive: false, conditions: null }];
    const decision = resolveRouting(rules, candidates, {});
    expect(decision.connectionId).toBeNull();
    expect(decision.strategy).toBe('MANUAL');
  });

  it('restricts eligible candidates to a rule-configured connectorSlug allowlist', () => {
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'CHEAPEST', priority: 0, isActive: true, conditions: { connectorSlugs: ['gelato'] } }];
    const decision = resolveRouting(rules, candidates, {});
    expect(decision.connectionId).toBe('c-gelato');
  });

  it('returns null with a reason when no candidates are available at all', () => {
    const decision = resolveRouting([], [], {});
    expect(decision.connectionId).toBeNull();
    expect(decision.reason).toMatch(/No connected fulfilment provider/);
  });

  it('falls back to manual when no rule matches (e.g. no cost data for CHEAPEST)', () => {
    const noCostCandidates: RoutingCandidate[] = [{ connectionId: 'c-x', connectorSlug: 'x' }];
    const rules: RoutingRuleInput[] = [{ id: 'r1', strategy: 'CHEAPEST', priority: 0, isActive: true, conditions: null }];
    const decision = resolveRouting(rules, noCostCandidates, {});
    expect(decision.connectionId).toBeNull();
  });
});
