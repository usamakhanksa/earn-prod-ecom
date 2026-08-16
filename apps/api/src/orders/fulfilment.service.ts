import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateRoutingRuleInput, FulfilOrderInput, RoutingRuleView, UpdateRoutingRuleInput } from '@omnisell/shared';
import { FulfilmentRepository } from '../repositories/fulfilment.repository';
import { OrderRepository } from '../repositories/order.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { AdapterRunnerService } from '../connections/adapter-runner.service';
import { AuditLogService } from '../audit/audit-log.service';
import { resolveRouting, type RoutingCandidate } from './fulfilment-routing.engine';
import { assertTransition } from './order-status.machine';

/**
 * Fulfilment submission + routing rules (featureslist.md 6.4/6.5, task 5.4).
 *
 * HONEST GAP (docs/DEBT.md): auto-routing candidates are built from real
 * `Connection`/`ConnectorDefinition` rows (real connectorSlug, real
 * `canFulfil` capability check) but WITHOUT live per-candidate cost/ETA data
 * — no live-authenticated `fetchCosts`/carrier-rate call exists end-to-end in
 * this codebase for a specific destination+SKU this phase (Phase 3's
 * `fetchCosts` needs a real provider variant id per candidate, which isn't
 * resolved here). `CHEAPEST`/`FASTEST` strategies therefore only pick a
 * winner when the routing rule ALSO happens to have region/stock data to
 * fall back on, or degrade to "no rule matched" (manual choice required) —
 * the routing ENGINE itself (`fulfilment-routing.engine.ts`) is fully real
 * and unit-tested against synthetic cost/ETA data; only this service's
 * real-world candidate enrichment is the documented gap.
 */
@Injectable()
export class FulfilmentService {
  constructor(
    private readonly fulfilments: FulfilmentRepository,
    private readonly orders: OrderRepository,
    private readonly connections: ConnectionRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly adapterRunner: AdapterRunnerService,
    private readonly audit: AuditLogService,
  ) {}

  async submit(tenantId: string, actorId: string, orderId: string, input: FulfilOrderInput, idempotencyKey: string) {
    const existingByKey = await this.fulfilments.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existingByKey !== null) {
      return existingByKey;
    }

    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    if (input.orderItemId !== undefined) {
      const item = order.items.find((i) => i.id === input.orderItemId);
      if (item === undefined) {
        throw new BadRequestException({ message: 'Order item does not belong to this order', code: 'ORDER_ITEM_MISMATCH' });
      }
    }

    let connectionId = input.connectionId;
    let connectorSlug: string | undefined;
    let strategy: string | null = null;
    let ruleId: string | null = null;

    if (connectionId !== undefined) {
      const connection = await this.connections.findById(tenantId, connectionId);
      if (connection === null) {
        throw new NotFoundException({ message: 'Connection not found', code: 'CONNECTION_NOT_FOUND' });
      }
      connectorSlug = connection.connectorSlug;
      strategy = 'MANUAL';
    } else {
      const rules = await this.fulfilments.listActiveRoutingRules(tenantId);
      const candidates = await this.buildCandidates(tenantId);
      const destinationRegion = extractCountry(order.shippingAddress);
      const decision = resolveRouting(
        rules.map((r) => ({ id: r.id, strategy: r.strategy as never, priority: r.priority, isActive: r.isActive, conditions: r.conditions as never })),
        candidates,
        { ...(destinationRegion !== undefined ? { destinationRegion } : {}) },
      );
      if (decision.connectionId === null) {
        throw new ConflictException({ message: decision.reason, code: 'NO_ROUTING_MATCH' });
      }
      connectionId = decision.connectionId;
      connectorSlug = decision.connectorSlug ?? undefined;
      strategy = decision.strategy;
      ruleId = decision.ruleId;
    }

    const fulfilment = await this.fulfilments.create({
      tenantId,
      orderId,
      orderItemId: input.orderItemId ?? null,
      connectionId,
      connectorSlug: connectorSlug ?? null,
      status: 'PENDING',
      routingStrategy: strategy,
      routingRuleId: ruleId,
      idempotencyKey,
    });

    try {
      const shippingAddress = (order.shippingAddress as Record<string, string> | null) ?? undefined;
      const result = await this.adapterRunner.run(tenantId, connectionId, async (adapter, ctx) => {
        if (adapter.submitFulfilment === undefined) {
          throw new Error(`Connector "${adapter.slug}" does not support fulfilment submission`);
        }
        return adapter.submitFulfilment(ctx, { externalOrderId: order.externalOrderId ?? order.id, ...(shippingAddress !== undefined ? { shippingAddress } : {}) });
      });

      const updated = await this.fulfilments.update(tenantId, fulfilment.id, {
        status: 'SUBMITTED',
        externalFulfilmentId: result.externalFulfilmentId,
        submittedAt: new Date(),
      });
      await this.orders.addEvent({ tenantId, orderId, type: 'FULFILMENT_SUBMITTED', message: `Fulfilment submitted to ${connectorSlug ?? 'provider'}`, actorId });
      if (order.status === 'NEW' || order.status === 'CONFIRMED') {
        assertTransition(order.status, 'IN_PRODUCTION');
        await this.orders.update(tenantId, orderId, { status: 'IN_PRODUCTION' });
      }
      await this.audit.record({ tenantId, actorId, action: 'fulfilment.submitted', entityType: 'Fulfilment', entityId: fulfilment.id, after: { status: 'SUBMITTED' } });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.fulfilments.update(tenantId, fulfilment.id, { status: 'FAILED', lastError: message });
      await this.orders.addEvent({ tenantId, orderId, type: 'FULFILMENT_FAILED', message, actorId });
      throw error;
    }
  }

  async listForOrder(tenantId: string, orderId: string) {
    return this.fulfilments.listForOrder(tenantId, orderId);
  }

  private async buildCandidates(tenantId: string): Promise<RoutingCandidate[]> {
    const connections = await this.connections.list(tenantId);
    const candidates: RoutingCandidate[] = [];
    for (const connection of connections.filter((c) => c.status === 'CONNECTED')) {
      const def = await this.connectorDefs.findBySlug(connection.connectorSlug);
      const caps = def?.capabilities as { canFulfil?: boolean } | undefined;
      if (caps?.canFulfil === true) {
        candidates.push({ connectionId: connection.id, connectorSlug: connection.connectorSlug });
      }
    }
    return candidates;
  }

  // --- Routing rule CRUD ---

  async listRoutingRules(tenantId: string): Promise<RoutingRuleView[]> {
    const rows = await this.fulfilments.listAllRoutingRules(tenantId);
    return rows.map(toRuleView);
  }

  async createRoutingRule(tenantId: string, input: CreateRoutingRuleInput): Promise<RoutingRuleView> {
    const row = await this.fulfilments.createRoutingRule({
      tenantId,
      name: input.name,
      strategy: input.strategy,
      priority: input.priority,
      isActive: input.isActive,
      ...(input.conditions !== undefined ? { conditions: input.conditions as Prisma.InputJsonValue } : {}),
    });
    return toRuleView(row);
  }

  async updateRoutingRule(tenantId: string, id: string, input: UpdateRoutingRuleInput): Promise<RoutingRuleView> {
    const row = await this.fulfilments.updateRoutingRule(tenantId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions as Prisma.InputJsonValue } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (row === null) {
      throw new NotFoundException({ message: 'Routing rule not found', code: 'ROUTING_RULE_NOT_FOUND' });
    }
    return toRuleView(row);
  }

  async deleteRoutingRule(tenantId: string, id: string): Promise<{ ok: boolean }> {
    return { ok: await this.fulfilments.deleteRoutingRule(tenantId, id) };
  }
}

function toRuleView(row: { id: string; name: string; strategy: string; priority: number; conditions: unknown; isActive: boolean }): RoutingRuleView {
  return { id: row.id, name: row.name, strategy: row.strategy, priority: row.priority, conditions: row.conditions, isActive: row.isActive };
}

function extractCountry(address: unknown): string | undefined {
  if (address === null || typeof address !== 'object') {
    return undefined;
  }
  const country = (address as Record<string, unknown>).country;
  return typeof country === 'string' ? country : undefined;
}
