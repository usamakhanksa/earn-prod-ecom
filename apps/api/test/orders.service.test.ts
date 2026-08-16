import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../src/orders/orders.service';
import type { OrderRepository } from '../src/repositories/order.repository';
import type { OrderExceptionRepository } from '../src/repositories/order-exception.repository';
import type { FulfilmentRepository } from '../src/repositories/fulfilment.repository';
import type { ShipmentRepository } from '../src/repositories/shipment.repository';
import type { SavedOrderViewRepository } from '../src/repositories/saved-order-view.repository';
import type { ProductPurchaseWithPointsRepository } from '../src/repositories/product-purchase-with-points.repository';
import type { RedemptionService } from '../src/points/redemption.service';
import type { EntitlementService } from '../src/digital/entitlement.service';
import type { AuditLogService } from '../src/audit/audit-log.service';

const orderRow = {
  id: 'order-1',
  tenantId: 't1',
  orderNumber: 'M-ABC123',
  connectorSlug: 'manual',
  externalOrderId: null,
  status: 'CONFIRMED',
  buyerName: 'Test Buyer',
  buyerEmail: 'buyer@example.com',
  currency: 'USD',
  subtotalMinor: 8000n,
  discountMinor: 0n,
  taxMinor: 0n,
  shippingMinor: 0n,
  totalMinor: 8000n,
  shippingAddress: null,
  billingAddress: null,
  holdReason: null,
  cancelReason: null,
  placedAt: new Date('2026-08-16T00:00:00.000Z'),
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  items: [],
  fees: [],
};

function makeDeps() {
  const orders = {
    findById: vi.fn().mockResolvedValue(orderRow),
    update: vi.fn().mockResolvedValue(undefined),
    addEvent: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
  };
  const exceptions = { listAllForOrder: vi.fn().mockResolvedValue([]) };
  const fulfilments = { listForOrder: vi.fn().mockResolvedValue([]) };
  const shipments = { listForOrder: vi.fn().mockResolvedValue([]) };
  const savedViews = {};
  const pointPurchases = {
    findConfirmedByOrderId: vi.fn().mockResolvedValue([
      { id: 'purchase-1', pointsUsed: 2500n, orderId: 'order-1' },
      { id: 'purchase-2', pointsUsed: 1000n, orderId: 'order-1' },
    ]),
  };
  const redemption = { refund: vi.fn().mockResolvedValue({ balanceAfter: '5000' }) };
  const entitlements = { grant: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { orders, exceptions, fulfilments, shipments, savedViews, pointPurchases, redemption, entitlements, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new OrdersService(
    deps.orders as unknown as OrderRepository,
    deps.exceptions as unknown as OrderExceptionRepository,
    deps.fulfilments as unknown as FulfilmentRepository,
    deps.shipments as unknown as ShipmentRepository,
    deps.savedViews as unknown as SavedOrderViewRepository,
    deps.pointPurchases as unknown as ProductPurchaseWithPointsRepository,
    deps.redemption as unknown as RedemptionService,
    deps.entitlements as unknown as EntitlementService,
    deps.audit as unknown as AuditLogService,
  );
}

/**
 * The Phase 5 headline wiring (docs/DEBT.md 4.5-D6, closed this pass):
 * cancelling/refunding an order that carries confirmed points-redemption
 * discounts must actually restore those points via `RedemptionService.refund`
 * — from this REAL code path, not merely available in isolation.
 */
describe('OrdersService.transition -> points-redemption-refund wiring', () => {
  it('cancelling an order refunds every confirmed points redemption attached to it', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.cancel('t1', 'u1', 'order-1', 'Customer changed their mind');

    expect(deps.pointPurchases.findConfirmedByOrderId).toHaveBeenCalledWith('t1', 'order-1');
    expect(deps.redemption.refund).toHaveBeenCalledTimes(2);
    expect(deps.redemption.refund).toHaveBeenCalledWith('t1', 'purchase-1');
    expect(deps.redemption.refund).toHaveBeenCalledWith('t1', 'purchase-2');
  });

  it('does NOT touch points redemptions on a non-cancel/refund transition (e.g. hold)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.hold('t1', 'u1', 'order-1', 'Payment under review');

    expect(deps.pointPurchases.findConfirmedByOrderId).not.toHaveBeenCalled();
    expect(deps.redemption.refund).not.toHaveBeenCalled();
  });

  it('rejects an illegal transition before ever looking at points redemptions', async () => {
    const deps = makeDeps();
    deps.orders.findById.mockResolvedValue({ ...orderRow, status: 'CANCELLED' });
    const service = makeService(deps);

    await expect(service.transition('t1', 'u1', 'order-1', 'DELIVERED')).rejects.toThrow();
    expect(deps.redemption.refund).not.toHaveBeenCalled();
  });
});
