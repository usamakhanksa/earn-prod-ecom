import type { OrderExceptionType } from '@omnisell/shared';

/** Default SLA windows per exception type (task 5.6/6.11) — hours until a
 * still-OPEN exception counts as breached. Conservative defaults; a tenant
 * override table doesn't exist yet (kept here as one seam, not a config
 * table, since no product requirement asked for per-tenant SLA tuning this
 * phase — see docs/OPEN_QUESTIONS.md). */
export const DEFAULT_SLA_HOURS: Record<OrderExceptionType, number> = {
  ADDRESS_INVALID: 24,
  OUT_OF_STOCK: 48,
  PRINT_REJECT: 12,
  PAYMENT_HOLD: 24,
  CUSTOMS: 72,
};

export function computeSlaDueAt(type: OrderExceptionType, from: Date): Date {
  const hours = DEFAULT_SLA_HOURS[type];
  return new Date(from.getTime() + hours * 3600_000);
}
