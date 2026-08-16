import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CouponRedeemResult, CouponView, CreateCouponInput, RedeemCouponInput, UpdateCouponInput } from '@omnisell/shared';
import { scaleMinor } from '@omnisell/shared';
import { CouponRepository } from '../repositories/coupon.repository';
import { PrismaService } from '../prisma/prisma.service';

/** Coupon engine: %/fixed/BOGO, usage caps, expiry, per-channel (featureslist.md
 * 7.6, task 5.11). "BOGO" (buy-one-get-one) is modelled here as a coupon type
 * whose discount equals one order-item's own price — the CALLER (checkout
 * flow) is responsible for identifying which item is "free"; this engine's
 * job is the cap/expiry/channel/usage bookkeeping common to all three types,
 * not per-type checkout logic (BOGO's "which item" question is a cart-level
 * decision, not a coupon-engine one). */
@Injectable()
export class CouponService {
  constructor(
    private readonly repo: CouponRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, input: CreateCouponInput): Promise<CouponView> {
    const existing = await this.repo.findByCode(tenantId, input.code);
    if (existing !== null) {
      throw new ConflictException({ message: 'A coupon with this code already exists', code: 'COUPON_CODE_TAKEN' });
    }
    const row = await this.repo.create({
      tenantId,
      code: input.code,
      type: input.type,
      valuePercent: input.valuePercent ?? null,
      valueMinor: input.valueMinor !== undefined ? BigInt(input.valueMinor) : null,
      currency: input.currency ?? null,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      startsAt: input.startsAt !== undefined ? new Date(input.startsAt) : null,
      expiresAt: input.expiresAt !== undefined ? new Date(input.expiresAt) : null,
      channels: input.channels,
    });
    return toView(row);
  }

  async list(tenantId: string): Promise<CouponView[]> {
    const rows = await this.repo.list(tenantId);
    return rows.map(toView);
  }

  async update(tenantId: string, id: string, input: UpdateCouponInput): Promise<CouponView> {
    const row = await this.repo.update(tenantId, id, {
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      ...(input.perCustomerLimit !== undefined ? { perCustomerLimit: input.perCustomerLimit } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt !== null ? new Date(input.expiresAt) : null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (row === null) {
      throw new NotFoundException({ message: 'Coupon not found', code: 'COUPON_NOT_FOUND' });
    }
    return toView(row);
  }

  async redeem(tenantId: string, input: RedeemCouponInput, idempotencyKey: string): Promise<CouponRedeemResult> {
    const existing = await this.repo.findRedemptionByIdempotencyKey(tenantId, idempotencyKey);
    if (existing !== null) {
      return { couponId: existing.couponId, discountMinor: existing.discountMinor.toString(), currency: existing.currency, redemptionId: existing.id };
    }

    return this.prisma.$transaction(async (tx) => {
      const coupon = await this.repo.findByCode(tenantId, input.code, tx);
      if (coupon === null || !coupon.isActive) {
        throw new NotFoundException({ message: 'Coupon not found or inactive', code: 'COUPON_NOT_FOUND' });
      }
      const now = new Date();
      if (coupon.startsAt !== null && coupon.startsAt > now) {
        throw new ForbiddenException({ message: 'This coupon is not active yet', code: 'COUPON_NOT_STARTED' });
      }
      if (coupon.expiresAt !== null && coupon.expiresAt < now) {
        throw new ForbiddenException({ message: 'This coupon has expired', code: 'COUPON_EXPIRED' });
      }
      if (coupon.channels.length > 0 && (input.connectorSlug === undefined || !coupon.channels.includes(input.connectorSlug))) {
        throw new ForbiddenException({ message: 'This coupon is not valid for this channel', code: 'COUPON_CHANNEL_MISMATCH' });
      }
      if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
        throw new ForbiddenException({ message: 'This coupon has reached its usage limit', code: 'COUPON_USAGE_LIMIT' });
      }
      if (coupon.perCustomerLimit !== null && input.buyerEmail !== undefined) {
        const perCustomerCount = await this.repo.countRedemptionsByBuyer(tenantId, coupon.id, input.buyerEmail, tx);
        if (perCustomerCount >= coupon.perCustomerLimit) {
          throw new ForbiddenException({ message: 'This coupon has already been used by this customer', code: 'COUPON_CUSTOMER_LIMIT' });
        }
      }

      const subtotalMinor = BigInt(input.subtotalMinor);
      let discountMinor: bigint;
      if (coupon.type === 'PERCENT') {
        discountMinor = scaleMinor(subtotalMinor, (coupon.valuePercent ?? 0) / 100);
      } else {
        // FIXED and BOGO both resolve to a flat minor-unit amount here — BOGO's
        // "which item is free" decision is the caller's (see class doc comment).
        discountMinor = coupon.valueMinor ?? 0n;
      }
      if (discountMinor > subtotalMinor) {
        discountMinor = subtotalMinor;
      }

      const redemption = await this.repo.createRedemption(
        {
          tenantId,
          couponId: coupon.id,
          orderId: input.orderId ?? null,
          buyerEmail: input.buyerEmail ?? null,
          discountMinor,
          currency: input.currency,
          idempotencyKey,
        },
        tx,
      );
      await this.repo.incrementUsage(coupon.id, tx);
      return { couponId: coupon.id, discountMinor: discountMinor.toString(), currency: input.currency, redemptionId: redemption.id };
    });
  }
}

function toView(row: {
  id: string;
  code: string;
  type: string;
  valuePercent: number | null;
  valueMinor: bigint | null;
  currency: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  channels: string[];
  isActive: boolean;
}): CouponView {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    valuePercent: row.valuePercent,
    valueMinor: row.valueMinor?.toString() ?? null,
    currency: row.currency,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    perCustomerLimit: row.perCustomerLimit,
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    channels: row.channels,
    isActive: row.isActive,
  };
}
