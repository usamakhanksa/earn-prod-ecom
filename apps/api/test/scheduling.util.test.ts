import { describe, expect, it } from 'vitest';
import { isDue, resolveScheduledAtUtc, toTenantLocalDisplay, tzOffsetMinutes } from '../src/publishing/scheduling/scheduling.util';

describe('scheduling.util', () => {
  describe('isDue', () => {
    it('is true when now equals the scheduled instant', () => {
      const t = new Date('2026-08-12T10:00:00Z');
      expect(isDue(t, t)).toBe(true);
    });

    it('is true when now is after the scheduled instant', () => {
      expect(isDue(new Date('2026-08-12T10:00:01Z'), new Date('2026-08-12T10:00:00Z'))).toBe(true);
    });

    it('is false when now is before the scheduled instant', () => {
      expect(isDue(new Date('2026-08-12T09:59:59Z'), new Date('2026-08-12T10:00:00Z'))).toBe(false);
    });
  });

  describe('tzOffsetMinutes', () => {
    it('is a fixed +180 for Asia/Riyadh (no DST)', () => {
      expect(tzOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Asia/Riyadh')).toBe(180);
      expect(tzOffsetMinutes(new Date('2026-07-15T00:00:00Z'), 'Asia/Riyadh')).toBe(180);
    });

    it('is 0 for UTC', () => {
      expect(tzOffsetMinutes(new Date('2026-08-12T00:00:00Z'), 'UTC')).toBe(0);
    });

    it('reflects the +5:30 half-hour offset for Asia/Kolkata', () => {
      expect(tzOffsetMinutes(new Date('2026-08-12T00:00:00Z'), 'Asia/Kolkata')).toBe(330);
    });

    it('reflects US DST transitions for America/New_York (EST -300 in Jan, EDT -240 in Jul)', () => {
      expect(tzOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300);
      expect(tzOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240);
    });
  });

  describe('resolveScheduledAtUtc', () => {
    it('converts a Riyadh local wall-clock time to the correct UTC instant', () => {
      // 2026-08-12 15:00 in Asia/Riyadh (UTC+3) => 12:00 UTC.
      const utc = resolveScheduledAtUtc('2026-08-12T15:00:00', 'Asia/Riyadh');
      expect(utc.toISOString()).toBe('2026-08-12T12:00:00.000Z');
    });

    it('converts a New York local wall-clock time correctly across a DST boundary (summer, EDT)', () => {
      // 2026-07-15 09:00 America/New_York (EDT, UTC-4) => 13:00 UTC.
      const utc = resolveScheduledAtUtc('2026-07-15T09:00:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });

    it('converts a New York local wall-clock time correctly in winter (EST)', () => {
      // 2026-01-15 09:00 America/New_York (EST, UTC-5) => 14:00 UTC.
      const utc = resolveScheduledAtUtc('2026-01-15T09:00:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    });

    it('round-trips through toTenantLocalDisplay for a fixed-offset zone', () => {
      const utc = resolveScheduledAtUtc('2026-08-12T15:00:00', 'Asia/Riyadh');
      const display = toTenantLocalDisplay(utc.toISOString(), 'Asia/Riyadh');
      expect(display).toContain('3:00');
    });

    it('throws on an invalid local datetime string', () => {
      expect(() => resolveScheduledAtUtc('not-a-date', 'Asia/Riyadh')).toThrow();
    });
  });

  describe('toTenantLocalDisplay', () => {
    it('formats a UTC instant in the requested timezone', () => {
      const display = toTenantLocalDisplay('2026-08-12T12:00:00.000Z', 'Asia/Riyadh');
      expect(display).toContain('3:00');
    });

    it('throws on an invalid ISO string', () => {
      expect(() => toTenantLocalDisplay('nonsense', 'UTC')).toThrow();
    });
  });
});
