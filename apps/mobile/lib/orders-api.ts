import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiRequestError, type OmniSellClient } from '@omnisell/api-client';
import type { OrderDetail, OrderSummary } from '@omnisell/shared';
import { OfflineOrderQueue, type SendResult } from './offline-queue';

/** Real `AsyncStorage`-backed queue instance the order screens share
 * (task 5.13's offline cache + queued mutations). */
export const offlineQueue = new OfflineOrderQueue({
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
});

const CACHE_KEY = 'omnisell.orders-cache.v1';

export async function listOrdersOfflineAware(client: OmniSellClient): Promise<{ items: OrderSummary[]; fromCache: boolean }> {
  try {
    const result = await client.get<{ items: OrderSummary[]; nextCursor: string | null }>('/orders');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result.items));
    return { items: result.items, fromCache: false };
  } catch (error) {
    // Offline cache read (task 5.13) — the feed still shows the last known
    // state rather than a blank screen when the network is unavailable.
    if (isNetworkError(error)) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached !== null) {
        return { items: JSON.parse(cached) as OrderSummary[], fromCache: true };
      }
    }
    throw error;
  }
}

export async function getOrderDetail(client: OmniSellClient, orderId: string): Promise<OrderDetail> {
  return client.get<OrderDetail>(`/orders/${orderId}`);
}

/** Fulfil action (featureslist.md 6.5) — offline-queued on a real network
 * failure rather than surfacing an error the user can't act on immediately. */
export async function fulfilOrderOfflineAware(client: OmniSellClient, orderId: string, idempotencyKey: string): Promise<{ queued: boolean }> {
  try {
    await client.post(`/orders/${orderId}/fulfil`, {}, idempotencyKey);
    return { queued: false };
  } catch (error) {
    if (isNetworkError(error)) {
      await offlineQueue.enqueue({ id: idempotencyKey, method: 'POST', path: `/orders/${orderId}/fulfil`, body: {}, idempotencyKey });
      return { queued: true };
    }
    throw error;
  }
}

export async function resolveExceptionOfflineAware(client: OmniSellClient, exceptionId: string, resolutionNote: string, idempotencyKey: string): Promise<{ queued: boolean }> {
  try {
    await client.post(`/orders/exceptions/${exceptionId}/resolve`, { resolutionNote }, idempotencyKey);
    return { queued: false };
  } catch (error) {
    if (isNetworkError(error)) {
      await offlineQueue.enqueue({ id: idempotencyKey, method: 'POST', path: `/orders/exceptions/${exceptionId}/resolve`, body: { resolutionNote }, idempotencyKey });
      return { queued: true };
    }
    throw error;
  }
}

/** Sync-on-reconnect (task 5.13) — call when the app regains focus/connectivity. */
export async function syncOfflineQueue(client: OmniSellClient): Promise<{ synced: number; conflicted: number; stillQueued: number }> {
  return offlineQueue.flush(async (mutation): Promise<SendResult> => {
    try {
      await client.post(mutation.path, mutation.body, mutation.idempotencyKey);
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return { ok: false, status: error.status };
      }
      return { ok: false };
    }
  });
}

function isNetworkError(error: unknown): boolean {
  // A real HTTP response (even an error one) means we ARE online — only a
  // genuine network-level failure (no ApiRequestError, e.g. fetch threw
  // TypeError: Network request failed) should route into the offline path.
  return !(error instanceof ApiRequestError);
}
