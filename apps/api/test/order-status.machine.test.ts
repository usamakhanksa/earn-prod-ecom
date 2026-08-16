import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminal, releaseTarget } from '../src/orders/order-status.machine';

describe('order status machine (featureslist.md 6.3)', () => {
  it('allows the exact happy path NEW -> CONFIRMED -> IN_PRODUCTION -> SHIPPED -> DELIVERED -> CLOSED', () => {
    expect(canTransition('NEW', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'IN_PRODUCTION')).toBe(true);
    expect(canTransition('IN_PRODUCTION', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransition('DELIVERED', 'CLOSED')).toBe(true);
  });

  it('allows ON_HOLD/CANCELLED from most happy-path states', () => {
    expect(canTransition('NEW', 'ON_HOLD')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('IN_PRODUCTION', 'ON_HOLD')).toBe(true);
  });

  it('rejects skipping the happy path', () => {
    expect(canTransition('NEW', 'SHIPPED')).toBe(false);
    expect(canTransition('NEW', 'DELIVERED')).toBe(false);
  });

  it('rejects any transition out of a terminal state (CANCELLED)', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(canTransition('CANCELLED', 'NEW')).toBe(false);
  });

  it('assertTransition throws IllegalOrderTransitionError on an illegal move', () => {
    expect(() => assertTransition('NEW', 'DELIVERED')).toThrow(/Cannot move an order/);
  });

  it('DELIVERED can still move to REFUNDED (post-delivery refund)', () => {
    expect(canTransition('DELIVERED', 'REFUNDED')).toBe(true);
  });

  it('releaseTarget returns the given happy-path status unchanged', () => {
    expect(releaseTarget('CONFIRMED')).toBe('CONFIRMED');
  });

  it('releaseTarget falls back to NEW for a non-happy-path input (defensive)', () => {
    expect(releaseTarget('CANCELLED')).toBe('NEW');
  });
});
