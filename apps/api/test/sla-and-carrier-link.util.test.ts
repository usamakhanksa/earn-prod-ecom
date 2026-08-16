import { describe, expect, it } from 'vitest';
import { computeSlaDueAt, DEFAULT_SLA_HOURS } from '../src/orders/sla.util';
import { buildCarrierTrackingUrl, estimateDeliveryDate } from '../src/orders/carrier-link.util';
import { mapExternalOrderStatus } from '../src/orders/order-status-mapper.util';

describe('SLA due-date computation (featureslist.md 6.11)', () => {
  it('adds the exact per-type SLA hours to the given start time', () => {
    const from = new Date('2026-08-16T00:00:00.000Z');
    const due = computeSlaDueAt('PRINT_REJECT', from);
    expect(due.toISOString()).toBe(new Date(from.getTime() + DEFAULT_SLA_HOURS.PRINT_REJECT * 3600_000).toISOString());
  });

  it('CUSTOMS has the longest default SLA window', () => {
    expect(DEFAULT_SLA_HOURS.CUSTOMS).toBeGreaterThan(DEFAULT_SLA_HOURS.PRINT_REJECT);
  });
});

describe('carrier tracking link generation (featureslist.md 6.6)', () => {
  it('builds a real USPS tracking URL', () => {
    expect(buildCarrierTrackingUrl('usps', '9400111899223197428400')).toContain('tools.usps.com');
  });

  it('is case/whitespace-insensitive on the carrier name', () => {
    expect(buildCarrierTrackingUrl('UPS', '1Z999AA10123456784')).toContain('ups.com');
  });

  it('returns null for an unknown carrier rather than guessing a URL', () => {
    expect(buildCarrierTrackingUrl('some-unknown-carrier', '12345')).toBeNull();
  });

  it('returns null when tracking number is missing', () => {
    expect(buildCarrierTrackingUrl('fedex', undefined)).toBeNull();
    expect(buildCarrierTrackingUrl('fedex', '')).toBeNull();
  });

  it('estimateDeliveryDate adds the transit days to shippedAt', () => {
    const shipped = new Date('2026-08-16T00:00:00.000Z');
    const eta = estimateDeliveryDate(shipped, 3);
    expect(eta.getUTCDate()).toBe(shipped.getUTCDate() + 3);
  });
});

describe('generic external order status mapping (task 5.1)', () => {
  it('maps common keywords to the right OrderStatus', () => {
    expect(mapExternalOrderStatus('cancelled')).toBe('CANCELLED');
    expect(mapExternalOrderStatus('refunded')).toBe('REFUNDED');
    expect(mapExternalOrderStatus('shipped')).toBe('SHIPPED');
    expect(mapExternalOrderStatus('fulfilled')).toBe('DELIVERED');
    expect(mapExternalOrderStatus('processing')).toBe('IN_PRODUCTION');
    expect(mapExternalOrderStatus('paid')).toBe('CONFIRMED');
  });

  it('degrades to NEW for an unrecognised status rather than guessing', () => {
    expect(mapExternalOrderStatus('some_weird_status')).toBe('NEW');
  });
});
