import type { OmniSellClient } from '@omnisell/api-client';

/**
 * Thin typed wrappers around the Phase 4.5 `/v1/wallet`, `/v1/video-watches`,
 * `/v1/videos` endpoints (docs/points-extension.md §9) — kept here rather
 * than inline in each screen so the wallet/videos/shop screens (docs/DEBT.md
 * 0-D7's placeholders) share one real client surface.
 */

export interface WalletView {
  balance: string;
  todayEarned: string;
  todayCapped: boolean;
  lifetimeEarned: string;
  lifetimeSpent: string;
  nextExpiry: { at: string; amount: string } | null;
}

export interface PointTransactionView {
  id: string;
  type: 'EARN' | 'SPEND' | 'ADJUST' | 'EXPIRY';
  amount: string;
  source: string;
  sourceId: string | null;
  status: 'PENDING' | 'VALIDATED' | 'REVERSED';
  validatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface VideoContentView {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  pointsPerView: number | null;
  resolvedPointsPerView: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  priceMinor: string;
  currency: string;
  status: string;
}

export async function fetchWallet(client: OmniSellClient): Promise<WalletView> {
  return client.get<WalletView>('/wallet');
}

export async function fetchWalletTransactions(client: OmniSellClient): Promise<{ items: PointTransactionView[]; nextCursor: string | null }> {
  return client.get('/wallet/transactions');
}

export async function fetchActiveVideos(client: OmniSellClient): Promise<VideoContentView[]> {
  return client.get<VideoContentView[]>('/videos');
}

export async function startWatch(client: OmniSellClient, videoId: string): Promise<{ watchId: string; heartbeatsMs: number }> {
  return client.post('/video-watches', { videoId });
}

export async function sendHeartbeat(client: OmniSellClient, watchId: string, watchPosition: number): Promise<{ verifiedSeconds: number }> {
  return client.post(`/video-watches/${watchId}/heartbeat`, { timestamp: new Date().toISOString(), watchPosition });
}

export async function completeWatch(
  client: OmniSellClient,
  watchId: string,
  finalWatchPosition?: number,
): Promise<{ earnedPoints: string | null; status: string }> {
  return client.post(`/video-watches/${watchId}/complete`, {
    ...(finalWatchPosition !== undefined ? { finalHeartbeat: { timestamp: new Date().toISOString(), watchPosition: finalWatchPosition } } : {}),
  });
}

export async function fetchProducts(client: OmniSellClient): Promise<{ items: ProductSummary[] }> {
  return client.get('/products');
}

export async function previewRedeem(
  client: OmniSellClient,
  productId: string,
  pointsToUse: number,
): Promise<{ discountCurrencyMinor: string; subtotalMinor: string; afterDiscountMinor: string; currency: string }> {
  return client.post('/wallet/redeem', { productId, pointsToUse });
}

export async function confirmRedeem(
  client: OmniSellClient,
  productId: string,
  pointsToUse: number,
  idempotencyKey: string,
): Promise<{ discountCurrencyMinor: string; balanceAfter: string; purchaseId: string }> {
  return client.post('/wallet/redeem/confirm', { orderId: null, productId, pointsToUse }, idempotencyKey);
}
