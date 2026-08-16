import { Injectable } from '@nestjs/common';
import type { OrderPollCursor, OrderWebhookEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Webhook-dedupe + poll-cursor bookkeeping (task 5.1). Two small,
 * closely-related tables that only ever exist to support order ingestion —
 * grouped in one repository rather than two near-empty files.
 */
@Injectable()
export class OrderIngestionRepository extends TenantScopedRepository<Pick<PrismaService, 'orderWebhookEvent'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  /** Idempotent webhook dedupe (prompt.md constraint #5). Returns `null` if
   * this exact (tenant, connector, event id) was already recorded — the
   * caller must treat that as a no-op, never a re-process. */
  async recordWebhookEventIfNew(
    input: Omit<Prisma.OrderWebhookEventUncheckedCreateInput, 'id'>,
  ): Promise<OrderWebhookEvent | null> {
    try {
      return await this.prisma.orderWebhookEvent.create({ data: input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async markProcessed(id: string, orderId: string | null, error: string | null = null): Promise<void> {
    await this.prisma.orderWebhookEvent.update({
      where: { id },
      data: { processedAt: new Date(), orderId, processError: error },
    });
  }

  async findPollCursor(tenantId: string, connectionId: string): Promise<OrderPollCursor | null> {
    return this.prisma.orderPollCursor.findFirst({ where: { tenantId, connectionId } });
  }

  async upsertPollCursor(
    tenantId: string,
    connectionId: string,
    data: { cursor?: string | null; lastError?: string | null },
  ): Promise<OrderPollCursor> {
    return this.prisma.orderPollCursor.upsert({
      where: { connectionId },
      update: { ...data, lastPolledAt: new Date() },
      create: {
        tenantId,
        connectionId,
        cursor: data.cursor ?? null,
        lastError: data.lastError ?? null,
        lastPolledAt: new Date(),
      },
    });
  }

  /** All connections whose connector uses poll-mode ingestion, across every
   * tenant — the sweep's fan-out list. Filtering by `ordersMechanism` happens
   * in the calling service (it needs the ConnectorDefinition, which this
   * repository intentionally does not reach into). */
  async listConnectionsForPolling(): Promise<Array<{ id: string; tenantId: string; connectorSlug: string }>> {
    return this.prisma.connection.findMany({
      where: { status: 'CONNECTED' },
      select: { id: true, tenantId: true, connectorSlug: true },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}
