import { Injectable } from '@nestjs/common';
import type { Prisma, ProductPurchaseWithPoints } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ProductPurchaseWithPointsRepository extends TenantScopedRepository<Pick<PrismaService, 'productPurchaseWithPoints'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(
    input: {
      tenantId: string;
      userId: string;
      productId: string;
      orderId?: string | null;
      pointsUsed: bigint;
      discountCurrencyMinor: bigint;
      idempotencyKey?: string | null;
    },
    client: Client = this.prisma,
  ): Promise<ProductPurchaseWithPoints> {
    return client.productPurchaseWithPoints.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        productId: input.productId,
        orderId: input.orderId ?? null,
        pointsUsed: input.pointsUsed,
        discountCurrencyMinor: input.discountCurrencyMinor,
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<ProductPurchaseWithPoints | null> {
    return this.prisma.productPurchaseWithPoints.findFirst({ where: { id, tenantId } });
  }

  /** Phase 5 — the real order-cancellation/refund wiring's lookup: every
   * still-CONFIRMED points redemption attached to this order, so the caller
   * (OrdersService/ReturnsRefundsService) can fire `RedemptionService.refund`
   * for each one instead of leaving points permanently spent on a cancelled
   * order (closes docs/DEBT.md 4.5-D6). */
  async findConfirmedByOrderId(tenantId: string, orderId: string): Promise<ProductPurchaseWithPoints[]> {
    return this.prisma.productPurchaseWithPoints.findMany({ where: { tenantId, orderId, status: 'CONFIRMED' } });
  }

  async markConfirmed(tenantId: string, id: string, client: Client = this.prisma): Promise<ProductPurchaseWithPoints> {
    return client.productPurchaseWithPoints.update({ where: { id, tenantId }, data: { status: 'CONFIRMED' } });
  }

  async markRefunded(tenantId: string, id: string, client: Client = this.prisma): Promise<ProductPurchaseWithPoints> {
    return client.productPurchaseWithPoints.update({ where: { id, tenantId }, data: { status: 'REFUNDED' } });
  }
}
