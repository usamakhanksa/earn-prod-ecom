import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { RedemptionService } from '../src/points/redemption.service';
import type { ProductRepository } from '../src/repositories/product.repository';
import type { WalletRepository } from '../src/repositories/wallet.repository';
import type { PointTransactionRepository } from '../src/repositories/point-transaction.repository';
import type { ProductPurchaseWithPointsRepository } from '../src/repositories/product-purchase-with-points.repository';
import type { TenantPointSettingsRepository } from '../src/repositories/tenant-point-settings.repository';
import type { OrderRepository } from '../src/repositories/order.repository';
import type { WalletService } from '../src/points/wallet.service';
import type { LedgerService } from '../src/points/ledger.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const settingsRow = {
  tenantId: 't1',
  currencyCode: 'USD',
  pointsPerCurrencyMinor: 1,
  minRedeemPoints: 100,
  maxRedeemSharePct: 50,
  autoExpireDays: 365,
  expiryReminderDays: 30,
  redemptionEnabled: true,
};

const productRow = { id: 'prod-1', tenantId: 't1', priceMinor: 8000n, currency: 'USD' }; // $80.00

function makeDeps() {
  const products = { findById: vi.fn().mockResolvedValue(productRow) };
  const wallets = { findOrCreateForUser: vi.fn().mockResolvedValue({ id: 'w1', tenantId: 't1', userId: 'u1', balance: 3000n, version: 1 }) };
  const pointTransactions = { create: vi.fn().mockResolvedValue({ id: 'ptx-1' }), markValidated: vi.fn().mockResolvedValue(undefined) };
  const purchases = {
    create: vi.fn().mockResolvedValue({ id: 'purchase-1' }),
    markConfirmed: vi.fn().mockResolvedValue(undefined),
    markRefunded: vi.fn().mockResolvedValue(undefined),
  };
  const settings = { findOrCreateDefault: vi.fn().mockResolvedValue(settingsRow) };
  const orders = { findById: vi.fn().mockResolvedValue(null) };
  const walletService = { applyValidatedDelta: vi.fn().mockResolvedValue({ balance: 500n }) };
  const ledger = { postRedemptionDiscount: vi.fn().mockResolvedValue({ id: 'entry-1' }), postRedemptionRefund: vi.fn().mockResolvedValue({ id: 'entry-2' }) };
  const prisma = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({ productPurchaseWithPoints: { findFirst: vi.fn() } })) };
  return { products, wallets, pointTransactions, purchases, settings, orders, walletService, ledger, prisma };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RedemptionService(
    deps.products as unknown as ProductRepository,
    deps.wallets as unknown as WalletRepository,
    deps.pointTransactions as unknown as PointTransactionRepository,
    deps.purchases as unknown as ProductPurchaseWithPointsRepository,
    deps.settings as unknown as TenantPointSettingsRepository,
    deps.orders as unknown as OrderRepository,
    deps.walletService as unknown as WalletService,
    deps.ledger as unknown as LedgerService,
    deps.prisma as unknown as PrismaService,
  );
}

/**
 * Redemption math — implemented EXACTLY per docs/points-extension.md §6.2's
 * worked example: rate 1 minor unit/point, $80.00 subtotal, 2,500 points
 * spent => raw discount $25.00; 50% share cap => $40.00 ceiling; final
 * discount is min($25, $40) = $25.00.
 */
describe('RedemptionService — §6.2 worked example', () => {
  it('preview() computes exactly the documented $25.00 discount', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.preview('t1', 'u1', { productId: 'prod-1', pointsToUse: 2500n });
    expect(result).toEqual({ discountCurrencyMinor: '2500', subtotalMinor: '8000', afterDiscountMinor: '5500', currency: 'USD' });
  });

  it('the share cap binds when the raw discount would exceed it', async () => {
    const deps = makeDeps();
    deps.wallets.findOrCreateForUser.mockResolvedValue({ id: 'w1', tenantId: 't1', userId: 'u1', balance: 100_000n, version: 1 });
    const service = makeService(deps);
    // 90,000 points at rate 1 => $900 raw discount, but 50% of $80 = $40 caps it
    const result = await service.preview('t1', 'u1', { productId: 'prod-1', pointsToUse: 90_000n });
    expect(result.discountCurrencyMinor).toBe('4000');
  });

  it('rejects a redemption below the tenant minimum with POINTS_REDEMPTION_FLOOR', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await expect(service.preview('t1', 'u1', { productId: 'prod-1', pointsToUse: 50n })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a redemption exceeding the wallet balance with POINTS_BALANCE_INSUFFICIENT', async () => {
    const deps = makeDeps();
    deps.wallets.findOrCreateForUser.mockResolvedValue({ id: 'w1', tenantId: 't1', userId: 'u1', balance: 100n, version: 1 });
    const service = makeService(deps);
    await expect(service.preview('t1', 'u1', { productId: 'prod-1', pointsToUse: 2500n })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses redemption entirely when the tenant has disabled it', async () => {
    const deps = makeDeps();
    deps.settings.findOrCreateDefault.mockResolvedValue({ ...settingsRow, redemptionEnabled: false });
    const service = makeService(deps);
    await expect(service.preview('t1', 'u1', { productId: 'prod-1', pointsToUse: 2500n })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('confirm() spends points, posts a balanced ledger pair, and marks the purchase CONFIRMED', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.confirm('t1', 'u1', { orderId: null, productId: 'prod-1', pointsToUse: 2500n }, 'idem-key-1');

    expect(deps.pointTransactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SPEND', amount: -2500n, source: 'redemption' }),
      expect.anything(),
    );
    expect(deps.walletService.applyValidatedDelta).toHaveBeenCalledWith(expect.anything(), 't1', 'w1', -2500n);
    expect(deps.ledger.postRedemptionDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', purchaseId: 'purchase-1', discountMinor: 2500n, currency: 'USD' }),
      expect.anything(),
    );
    expect(deps.purchases.markConfirmed).toHaveBeenCalledWith('t1', 'purchase-1', expect.anything());
    expect(result).toEqual({ discountCurrencyMinor: '2500', balanceAfter: '500', purchaseId: 'purchase-1' });
  });

  it('refund() restores points via a NEW EARN row and reverses the ledger — never mutates the original SPEND', async () => {
    const deps = makeDeps();
    const purchaseRow = { id: 'purchase-1', tenantId: 't1', userId: 'u1', productId: 'prod-1', pointsUsed: 2500n, discountCurrencyMinor: 2500n, status: 'CONFIRMED' };
    deps.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) =>
      fn({ productPurchaseWithPoints: { findFirst: vi.fn().mockResolvedValue(purchaseRow) } }),
    );
    const service = makeService(deps);
    const result = await service.refund('t1', 'purchase-1');

    expect(deps.pointTransactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EARN', amount: 2500n, source: 'redemption_refund', sourceId: 'purchase-1' }),
      expect.anything(),
    );
    expect(deps.walletService.applyValidatedDelta).toHaveBeenCalledWith(expect.anything(), 't1', 'w1', 2500n);
    expect(deps.ledger.postRedemptionRefund).toHaveBeenCalled();
    expect(deps.purchases.markRefunded).toHaveBeenCalledWith('t1', 'purchase-1', expect.anything());
    expect(result).toEqual({ balanceAfter: '500' });
  });

  it('refund() refuses a purchase that is not CONFIRMED', async () => {
    const deps = makeDeps();
    const purchaseRow = { id: 'purchase-1', tenantId: 't1', userId: 'u1', status: 'PENDING' };
    deps.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) =>
      fn({ productPurchaseWithPoints: { findFirst: vi.fn().mockResolvedValue(purchaseRow) } }),
    );
    const service = makeService(deps);
    await expect(service.refund('t1', 'purchase-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
