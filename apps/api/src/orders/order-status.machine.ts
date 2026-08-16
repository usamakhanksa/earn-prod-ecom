import type { OrderStatus } from '@omnisell/shared';

/**
 * Order status machine (task 5.2 / featureslist.md 6.3) — EXACTLY
 * implentationplanphase.md's Phase 5 entry: `NEW -> CONFIRMED ->
 * IN_PRODUCTION -> SHIPPED -> DELIVERED -> CLOSED` plus three side-states
 * reachable from most points in the happy path (`CANCELLED` / `REFUNDED` /
 * `ON_HOLD`). Pure logic — no I/O — so it is fully unit-testable and the one
 * place every legal transition is enumerated; `OrdersService` never writes a
 * status without going through `assertTransition` first.
 */
const HAPPY_PATH: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CLOSED'];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'ON_HOLD', 'CANCELLED'],
  IN_PRODUCTION: ['SHIPPED', 'ON_HOLD', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'ON_HOLD'],
  DELIVERED: ['CLOSED', 'REFUNDED'],
  CLOSED: ['REFUNDED'],
  ON_HOLD: ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'CANCELLED'], // release returns to wherever hold was applied from
  CANCELLED: [],
  REFUNDED: [],
};

export class IllegalOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Cannot move an order from "${from}" to "${to}"`);
    this.name = 'IllegalOrderTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
}

/** The status a HOLD should return to on release — the last happy-path
 * status before ON_HOLD was applied. Held here as an explicit input rather
 * than inferred, since `ON_HOLD` itself carries no memory of where it came
 * from (the caller/service supplies `previousStatus`, read off the order's
 * own last non-hold status via its event log). */
export function releaseTarget(previousStatus: OrderStatus): OrderStatus {
  if (previousStatus === 'ON_HOLD' || previousStatus === 'CANCELLED' || previousStatus === 'REFUNDED') {
    return 'NEW'; // defensive fallback — should never actually be reached
  }
  return previousStatus;
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isHappyPathStatus(status: OrderStatus): boolean {
  return HAPPY_PATH.includes(status);
}
