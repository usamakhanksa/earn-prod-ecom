import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntitlementView, GrantEntitlementInput } from '@omnisell/shared';
import { EntitlementRepository } from '../repositories/entitlement.repository';

/** Entitlement records tied to order/customer (featureslist.md 7.4, task
 * 5.10) — grants are triggered from `OrdersService.createManualOrder` (a
 * digital-only sale) or explicitly via this service's `grant` for a
 * channel-ingested order once a human maps its line item to a
 * `DigitalProduct` (auto-mapping from an external SKU isn't wired this pass
 * — see docs/OPEN_QUESTIONS.md). */
@Injectable()
export class EntitlementService {
  constructor(private readonly repo: EntitlementRepository) {}

  async grant(tenantId: string, input: GrantEntitlementInput): Promise<EntitlementView> {
    const row = await this.repo.create({
      tenantId,
      userId: input.userId ?? null,
      buyerEmail: input.buyerEmail ?? null,
      digitalProductId: input.digitalProductId,
      orderId: input.orderId ?? null,
      orderItemId: input.orderItemId ?? null,
      status: 'ACTIVE',
    });
    return toView(row);
  }

  async list(tenantId: string, filters: { userId?: string; digitalProductId?: string; orderId?: string }): Promise<EntitlementView[]> {
    const rows = await this.repo.list(tenantId, filters);
    return rows.map(toView);
  }

  async getOne(tenantId: string, id: string): Promise<EntitlementView> {
    const row = await this.repo.findById(tenantId, id);
    if (row === null) {
      throw new NotFoundException({ message: 'Entitlement not found', code: 'ENTITLEMENT_NOT_FOUND' });
    }
    return toView(row);
  }

  async revoke(tenantId: string, id: string): Promise<EntitlementView> {
    const row = await this.repo.revoke(tenantId, id);
    if (row === null) {
      throw new NotFoundException({ message: 'Entitlement not found', code: 'ENTITLEMENT_NOT_FOUND' });
    }
    return toView(row);
  }
}

function toView(row: { id: string; userId: string | null; buyerEmail: string | null; digitalProductId: string; orderId: string | null; status: string; createdAt: Date; revokedAt: Date | null }): EntitlementView {
  return {
    id: row.id,
    userId: row.userId,
    buyerEmail: row.buyerEmail,
    digitalProductId: row.digitalProductId,
    orderId: row.orderId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
