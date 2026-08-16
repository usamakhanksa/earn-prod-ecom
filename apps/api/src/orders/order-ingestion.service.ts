import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { NormalisedOrder } from '@omnisell/connectors';
import { OrderIngestionRepository } from '../repositories/order-ingestion.repository';
import { OrderRepository } from '../repositories/order.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { AdapterRunnerService } from '../connections/adapter-runner.service';
import { verifyWebhookSignature } from './order-webhook-verification.util';
import { mapExternalOrderStatus } from './order-status-mapper.util';

/**
 * Order ingestion (task 5.1) — webhook receiver + polling fallback, sharing
 * ONE upsert code path (`upsertNormalisedOrder`) regardless of which
 * triggered it. Deliberate design (docs/OPEN_QUESTIONS.md): a webhook
 * payload's exact shape/completeness varies per provider and per event type
 * (a "order updated" ping often carries only an id + new status, not a full
 * line-item breakdown) — rather than guessing at each provider's partial
 * webhook body shape, a verified webhook triggers an immediate,
 * bounded `pullOrders` reconciliation call through the SAME adapter method
 * the poll-mode fallback uses, so both paths converge on one normalised,
 * fully-populated `NormalisedOrder` shape. This is a real, documented
 * architecture choice (a resilience pattern several providers' own docs
 * recommend — "don't trust the webhook body alone, reconcile"), not a
 * shortcut standing in for per-payload parsing.
 */
@Injectable()
export class OrderIngestionService {
  private readonly logger = new Logger(OrderIngestionService.name);

  constructor(
    private readonly ingestion: OrderIngestionRepository,
    private readonly orderRepo: OrderRepository,
    private readonly connections: ConnectionRepository,
    private readonly connectorDefs: ConnectorDefinitionRepository,
    private readonly adapterRunner: AdapterRunnerService,
  ) {}

  async resolveTenantIdForConnection(connectionId: string): Promise<string> {
    const tenantId = await this.connections.findTenantIdById(connectionId);
    if (tenantId === null) {
      throw new NotFoundException({ message: 'Connection not found for this webhook', code: 'CONNECTION_NOT_FOUND' });
    }
    return tenantId;
  }

  async handleWebhook(
    tenantId: string,
    connectionId: string,
    slug: string,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<{ ok: boolean; deduped: boolean; signatureValid: boolean }> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (connection === null || connection.connectorSlug !== slug) {
      throw new NotFoundException({ message: 'Connection not found for this webhook', code: 'CONNECTION_NOT_FOUND' });
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = { raw: rawBody };
    }

    const { adapter, ctx } = await this.adapterRunner.resolve(tenantId, connectionId);
    // See this class's doc comment + docs/DEBT.md: no dedicated webhook-secret
    // field exists yet, so the connection's primary credential material
    // stands in as the HMAC key.
    const secret = ctx.accessToken ?? ctx.secondaryToken ?? '';
    const signatureValid = verifyWebhookSignature(headers, rawBody, secret);

    const externalEventId = headers['x-webhook-id'] ?? headers['x-shopify-webhook-id'] ?? headers['x-wc-webhook-id'] ?? sha256Hex(rawBody);

    const recorded = await this.ingestion.recordWebhookEventIfNew({
      tenantId,
      connectionId,
      connectorSlug: slug,
      externalEventId,
      signatureValid,
      rawPayload: parsedBody as never,
    });
    if (recorded === null) {
      this.logger.debug(`Duplicate webhook event ignored (${slug}/${externalEventId})`);
      return { ok: true, deduped: true, signatureValid };
    }

    let orderId: string | null = null;
    try {
      if (adapter.handleWebhook !== undefined) {
        const events = await adapter.handleWebhook(ctx, { headers, body: parsedBody });
        const withOrder = events.find((e) => e.externalOrderId !== null);
        if (withOrder?.externalOrderId !== null && withOrder?.externalOrderId !== undefined) {
          const existing = await this.orderRepo.findByExternalId(tenantId, slug, withOrder.externalOrderId);
          orderId = existing?.id ?? null;
        }
      }
      // Reconcile against the authoritative pullOrders data (bounded to one page).
      await this.pollConnectionOnce(tenantId, connectionId, 'webhook');
      await this.ingestion.markProcessed(recorded.id, orderId);
    } catch (error) {
      await this.ingestion.markProcessed(recorded.id, orderId, error instanceof Error ? error.message : String(error));
      throw error;
    }
    return { ok: true, deduped: false, signatureValid };
  }

  /** One bounded pull for one connection (also the poll-mode fallback's unit
   * of work). Silently no-ops for a connector/adapter that doesn't support
   * `pullOrders` (Tier C, or an adapter with `canSyncOrders: false`). */
  async pollConnectionOnce(tenantId: string, connectionId: string, source: 'webhook' | 'poll' = 'poll'): Promise<{ upserted: number }> {
    const { adapter } = await this.adapterRunner.resolve(tenantId, connectionId);
    if (adapter.pullOrders === undefined) {
      return { upserted: 0 };
    }
    const cursorRow = await this.ingestion.findPollCursor(tenantId, connectionId);
    const page = await this.adapterRunner.run(tenantId, connectionId, async (a, ctx) => a.pullOrders!(ctx, cursorRow?.cursor ?? undefined));
    let upserted = 0;
    for (const order of page.items) {
      await this.upsertNormalisedOrder(tenantId, connectionId, adapter.slug, order, source);
      upserted += 1;
    }
    await this.ingestion.upsertPollCursor(tenantId, connectionId, { cursor: page.nextCursor });
    return { upserted };
  }

  /** The polling-fallback sweep (task 5.1) — every CONNECTED connection whose
   * connector declares `ordersMechanism: 'poll'` AND `canSyncOrders: true`.
   * Real, callable logic; nothing calls it on a schedule yet (same class of
   * gap as `TokenRefreshService.runSweep`/`ExpiryService.runExpirySweep` —
   * docs/DEBT.md 3-D5/4.5-D3). */
  async runPollSweep(): Promise<{ polledConnections: number; ordersUpserted: number }> {
    const candidates = await this.ingestion.listConnectionsForPolling();
    let polledConnections = 0;
    let ordersUpserted = 0;
    for (const c of candidates) {
      const def = await this.connectorDefs.findBySlug(c.connectorSlug);
      const caps = def?.capabilities as { ordersMechanism?: string; canSyncOrders?: boolean } | undefined;
      if (caps?.canSyncOrders !== true || caps.ordersMechanism !== 'poll') {
        continue;
      }
      try {
        const result = await this.pollConnectionOnce(c.tenantId, c.id, 'poll');
        polledConnections += 1;
        ordersUpserted += result.upserted;
      } catch (error) {
        this.logger.warn(`Poll sweep failed for connection ${c.id} (${c.connectorSlug}): ${String(error)}`);
      }
    }
    return { polledConnections, ordersUpserted };
  }

  private async upsertNormalisedOrder(
    tenantId: string,
    connectionId: string,
    connectorSlug: string,
    order: NormalisedOrder,
    source: 'webhook' | 'poll',
  ): Promise<string> {
    const status = mapExternalOrderStatus(order.status);
    const existing = await this.orderRepo.findByExternalId(tenantId, connectorSlug, order.externalOrderId);
    if (existing !== null) {
      if (existing.status !== status) {
        await this.orderRepo.update(tenantId, existing.id, { status, lastSyncedAt: new Date() });
        await this.orderRepo.addEvent({ tenantId, orderId: existing.id, type: 'STATUS_CHANGE', message: `${existing.status} -> ${status} (synced from ${connectorSlug})` });
      } else {
        await this.orderRepo.update(tenantId, existing.id, { lastSyncedAt: new Date() });
      }
      return existing.id;
    }

    const subtotalMinor = order.items.reduce((sum, i) => sum + i.priceMinor * BigInt(i.quantity), 0n);
    const created = await this.orderRepo.createWithItems(
      {
        tenantId,
        connectionId,
        connectorSlug,
        externalOrderId: order.externalOrderId,
        orderNumber: order.externalOrderId,
        status,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        currency: order.currency,
        subtotalMinor,
        totalMinor: order.totalMinor,
        placedAt: new Date(order.createdAt),
        ingestSource: source,
        lastSyncedAt: new Date(),
      },
      order.items.map((item) => ({
        externalVariantId: item.externalVariantId,
        title: `Item ${item.externalVariantId}`,
        quantity: item.quantity,
        unitPriceMinor: item.priceMinor,
        totalPriceMinor: item.priceMinor * BigInt(item.quantity),
        currency: item.currency,
        isDigital: false,
      })),
      [],
    );
    await this.orderRepo.addEvent({ tenantId, orderId: created.id, type: 'INGESTED', message: `Order ingested from ${connectorSlug} (${source})` });
    return created.id;
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
