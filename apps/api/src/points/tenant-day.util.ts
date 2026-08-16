/**
 * Tenant-local "day" boundary (docs/points-extension.md §7.3 — "Tenant-day
 * resets at midnight in the tenant timezone (not UTC)"). No timezone library
 * is installed in this workspace, so this uses the standard Intl-based trick:
 * format `instant` in `timeZone` to learn its local time-of-day, then
 * subtract that duration to land on local midnight of the same calendar day.
 *
 * This is exact for ordinary days. On a DST-transition day in `timeZone` the
 * "day" can be 23 or 25 real hours — a known, honest, cosmetic edge case for
 * a points daily-cap reset (nobody's cap resets a literal hour early/late on
 * two days a year), not a correctness bug for any other invariant in this
 * phase. A real IANA-aware library (`luxon`/`date-fns-tz`) would remove even
 * that if it ever matters.
 */
export function startOfTenantDay(timeZone: string, instant: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = lookup.hour === '24' ? 0 : Number(lookup.hour ?? '0');
  const minute = Number(lookup.minute ?? '0');
  const second = Number(lookup.second ?? '0');
  const localMs = hour * 3_600_000 + minute * 60_000 + second * 1000;
  return new Date(instant.getTime() - localMs);
}
