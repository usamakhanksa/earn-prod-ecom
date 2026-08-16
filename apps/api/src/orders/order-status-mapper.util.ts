import type { OrderStatus } from '@omnisell/shared';

/**
 * Best-effort generic mapping from a provider's free-text order status
 * string to OmniSell's own `OrderStatus` (task 5.1). Deliberately NOT a
 * per-connector precise table (no adapter's real docs were independently
 * re-verified for their EXACT status vocabulary this pass — same honesty
 * standard as `fetchListingState`'s Phase 4 gap) — a simple, documented
 * keyword heuristic that degrades to `NEW` rather than guessing wrong.
 */
export function mapExternalOrderStatus(raw: string): OrderStatus {
  const s = raw.toLowerCase();
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('refund')) return 'REFUNDED';
  if (s.includes('hold') || s.includes('pending_payment') || s.includes('payment_pending')) return 'ON_HOLD';
  if (s.includes('deliver') || s.includes('complete') || s.includes('fulfilled')) return 'DELIVERED';
  if (s.includes('ship')) return 'SHIPPED';
  if (s.includes('production') || s.includes('processing') || s.includes('in_progress')) return 'IN_PRODUCTION';
  if (s.includes('confirm') || s.includes('paid') || s.includes('open')) return 'CONFIRMED';
  return 'NEW';
}
