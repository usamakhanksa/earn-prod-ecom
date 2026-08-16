import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { RedeemConfirmResult, RedeemPreviewResult } from '@omnisell/shared';
import { pointsToWire } from '@omnisell/shared';
import { ProductRepository } from '../repositories/product.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { PointTransactionRepository } from '../repositories/point-transaction.repository';
import { ProductPurchaseWithPointsRepository } from '../repositories/product-purchase-with-points.repository';
import { TenantPointSettingsRepository } from '../repositories/tenant-point-settings.repository';
import { OrderRepository } from '../repositories/order.repository';
import { WalletService } from './wallet.service';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../prisma/prisma.service';

interface RedemptionMath {
  discountMinor: bigint;
  subtotalMinor: bigint;
  afterDiscountMinor: bigint;
  currency: string;
}

/**
 * Redemption flow (docs/points-extension.md §7.4/§9.3, task 4.5.5). Math is
 * implemented EXACTLY per §6.2's worked example:
 *   discountMinor    = floor(pointsUsed / pointsPerCurrencyMinor)
 *   maxDiscountMinor = floor(subtotalMinor * maxRedeemSharePct / 100)
 *   discount         = min(discountMinor, maxDiscountMinor)
 * All-BigInt arithmetic — `/` on `bigint` already floors toward zero for
 * non-negative operands, so no separate `Math.floor` call is needed or
 * possible (floats never enter this path).
 *
 * Phase 5 update (closes docs/DEBT.md 4.5-D6 / docs/OPEN_QUESTIONS.md #41):
 * `Order`/`OrderItem` now exist. When the caller supplies a real `orderId`
 * that resolves to a tenant-owned `Order`, `subtotalMinor` is that order's
 * REAL multi-item `subtotalMinor` — not the single product's `priceMinor`.
 * The single-product fallback stays exactly as it was for the (still valid)
 * case of previewing/confirming a redemption before an Order row exists yet
 * (e.g. a quick single-item checkout that creates the Order afterward and
 * backfills `orderId`). The floor/share-cap/rate math itself is unchanged —
 * only what "subtotal" means when an order is present.
 */
@Injectable()
export class RedemptionService {
  constructor(
    private readonly products: ProductRepository,
    private readonly wallets: WalletRepository,
    private readonly pointTransactions: PointTransactionRepository,
    private readonly purchases: ProductPurchaseWithPointsRepository,
    private readonly settings: TenantPointSettingsRepository,
    private readonly orders: OrderRepository,
    private readonly walletService: WalletService,
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  private async computeMath(tenantId: string, productId: string, pointsToUse: bigint, orderId?: string | null): Promise<RedemptionMath> {
    const settings = await this.settings.findOrCreateDefault(tenantId);
    if (!settings.redemptionEnabled) {
      throw new ForbiddenException({ message: 'Points redemption is disabled for this tenant', code: 'POINTS_REDEMPTION_DISABLED' });
    }
    if (pointsToUse < BigInt(settings.minRedeemPoints)) {
      throw new UnprocessableEntityException({ message: `Minimum redemption is ${settings.minRedeemPoints} points`, code: 'POINTS_REDEMPTION_FLOOR' });
    }
    const product = await this.products.findById(tenantId, productId);
    if (product === null) {
      throw new NotFoundException({ message: 'Product not found', code: 'PRODUCT_NOT_FOUND' });
    }

    let subtotalMinor = product.priceMinor;
    let currency = product.currency;
    if (orderId !== null && orderId !== undefined) {
      const order = await this.orders.findById(tenantId, orderId);
      if (order === null) {
        throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
      }
      subtotalMinor = order.subtotalMinor;
      currency = order.currency;
    }

    const rawDiscountMinor = pointsToUse / BigInt(settings.pointsPerCurrencyMinor);
    const maxDiscountMinor = (subtotalMinor * BigInt(settings.maxRedeemSharePct)) / 100n;
    const discountMinor = rawDiscountMinor < maxDiscountMinor ? rawDiscountMinor : maxDiscountMinor;
    return { discountMinor, subtotalMinor, afterDiscountMinor: subtotalMinor - discountMinor, currency };
  }

  async preview(tenantId: string, userId: string, input: { productId: string; pointsToUse: bigint; orderId?: string | null | undefined }): Promise<RedeemPreviewResult> {
    const wallet = await this.wallets.findOrCreateForUser(tenantId, userId);
    if (input.pointsToUse > wallet.balance) {
      throw new ConflictException({ message: 'Not enough validated points for this redemption', code: 'POINTS_BALANCE_INSUFFICIENT' });
    }
    const math = await this.computeMath(tenantId, input.productId, input.pointsToUse, input.orderId);
    return {
      discountCurrencyMinor: pointsToWire(math.discountMinor),
      subtotalMinor: pointsToWire(math.subtotalMinor),
      afterDiscountMinor: pointsToWire(math.afterDiscountMinor),
      currency: math.currency,
    };
  }

  async confirm(
    tenantId: string,
    userId: string,
    input: { orderId: string | null; productId: string; pointsToUse: bigint },
    idempotencyKey: string,
  ): Promise<RedeemConfirmResult> {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.findOrCreateForUser(tenantId, userId, tx);
      if (input.pointsToUse > wallet.balance) {
        throw new ConflictException({ message: 'Not enough validated points for this redemption', code: 'POINTS_BALANCE_INSUFFICIENT' });
      }
      // Recomputed fresh, inside the transaction — never trust a client-
      // supplied discount value even if it matches an earlier preview call.
      const math = await this.computeMath(tenantId, input.productId, input.pointsToUse, input.orderId);

      const purchase = await this.purchases.create(
        {
          tenantId,
          userId,
          productId: input.productId,
          orderId: input.orderId,
          pointsUsed: input.pointsToUse,
          discountCurrencyMinor: math.discountMinor,
          idempotencyKey,
        },
        tx,
      );

      const spendTransaction = await this.pointTransactions.create(
        {
          walletId: wallet.id,
          tenantId,
          userId,
          type: 'SPEND',
          amount: -input.pointsToUse,
          source: 'redemption',
          sourceId: purchase.id,
          status: 'PENDING',
        },
        tx,
      );
      await this.pointTransactions.markValidated(tenantId, spendTransaction.id, tx);
      const updatedWallet = await this.walletService.applyValidatedDelta(tx, tenantId, wallet.id, -input.pointsToUse);

      await this.ledger.postRedemptionDiscount({ tenantId, purchaseId: purchase.id, discountMinor: math.discountMinor, currency: math.currency }, tx);
      await this.purchases.markConfirmed(tenantId, purchase.id, tx);

      return { discountCurrencyMinor: pointsToWire(math.discountMinor), balanceAfter: pointsToWire(updatedWallet.balance), purchaseId: purchase.id };
    });
  }

  /** §7.4.3/§17 locked default #4 — refund restores points via a NEW `EARN`
   * row, never a negative-balance carry or a mutated historical row. Keyed
   * on `(tenantId, purchaseId)` only — a FINANCE/ADMIN caller triggering a
   * refund on a customer's behalf is not the purchase's own `userId`, so the
   * wallet credited is always the ORIGINAL purchaser's (`purchase.userId`),
   * read from the row itself, never assumed from the caller's identity. */
  async refund(tenantId: string, purchaseId: string): Promise<{ balanceAfter: string }> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.productPurchaseWithPoints.findFirst({ where: { id: purchaseId, tenantId } });
      if (purchase === null) {
        throw new NotFoundException({ message: 'Purchase not found', code: 'PURCHASE_NOT_FOUND' });
      }
      if (purchase.status !== 'CONFIRMED') {
        throw new ConflictException({ message: 'Only a CONFIRMED redemption can be refunded', code: 'PURCHASE_NOT_REFUNDABLE' });
      }

      const userId = purchase.userId;
      const wallet = await this.wallets.findOrCreateForUser(tenantId, userId, tx);
      const refundTransaction = await this.pointTransactions.create(
        {
          walletId: wallet.id,
          tenantId,
          userId,
          type: 'EARN',
          amount: purchase.pointsUsed,
          source: 'redemption_refund',
          sourceId: purchase.id,
          status: 'PENDING',
        },
        tx,
      );
      await this.pointTransactions.markValidated(tenantId, refundTransaction.id, tx);
      const updatedWallet = await this.walletService.applyValidatedDelta(tx, tenantId, wallet.id, purchase.pointsUsed);

      const product = await this.products.findById(tenantId, purchase.productId);
      await this.ledger.postRedemptionRefund(
        { tenantId, purchaseId: purchase.id, discountMinor: purchase.discountCurrencyMinor, currency: product?.currency ?? 'USD' },
        tx,
      );
      await this.purchases.markRefunded(tenantId, purchase.id, tx);

      return { balanceAfter: pointsToWire(updatedWallet.balance) };
    });
  }
}
