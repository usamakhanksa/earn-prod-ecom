/**
 * Scheduling (featureslist.md 5.9, implentationplanphase.md task 4.9) — pure
 * timezone math, fully real and unit-tested. `Listing.scheduledAt` is always
 * stored in UTC (prompt.md constraint-adjacent convention: never store a
 * wall-clock time ambiguous about its zone); these helpers resolve display
 * and "is it time yet" against the tenant's IANA timezone. No live cron
 * runner exists in this sandbox (same Redis-adjacent gap as the queue/token-
 * refresh scheduling — docs/DEBT.md); `isDue`/`resolveScheduledAtUtc` are
 * what a real repeatable job would call, and are exercised directly by tests.
 */

/** True once `nowUtc` has reached or passed `scheduledAtUtc`. */
export function isDue(nowUtc: Date, scheduledAtUtc: Date): boolean {
  return nowUtc.getTime() >= scheduledAtUtc.getTime();
}

/** Minutes east of UTC for `timeZone` at the instant `utcDate` represents
 * (positive for zones ahead of UTC, e.g. +180 for Asia/Riyadh). Computed by
 * asking Intl what the wall-clock reads in that zone for this instant, then
 * diffing against the instant itself — no external tz database dependency,
 * relies only on Node's built-in (full-ICU) Intl support. */
export function tzOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Treat the formatted wall-clock reading AS IF it were UTC, to get an
  // instant we can diff against the real UTC instant — the difference is
  // exactly the zone's offset at this moment (handles DST correctly, since
  // Intl resolves the offset for THIS specific instant, not a fixed rule).
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asIfUtc - utcDate.getTime()) / 60_000);
}

/**
 * Converts a "local wall-clock" datetime (as typed into a scheduling form —
 * no zone info of its own) in `timeZone` to the correct UTC instant.
 * Iterates twice: the zone's UTC offset can itself depend on the instant
 * (DST transitions), so a first-pass guess using offset-at-the-naive-instant
 * is refined once against the offset at the resulting candidate instant —
 * standard technique, converges within 1-2 iterations for every real IANA
 * zone (there is no zone whose offset changes twice within one adjustment
 * step's magnitude).
 */
export function resolveScheduledAtUtc(localDateTimeIso: string, timeZone: string): Date {
  const naiveUtcMs = Date.parse(localDateTimeIso.endsWith('Z') ? localDateTimeIso : `${localDateTimeIso}Z`);
  if (Number.isNaN(naiveUtcMs)) {
    throw new Error(`Invalid local datetime: ${localDateTimeIso}`);
  }
  let candidate = naiveUtcMs;
  for (let i = 0; i < 2; i += 1) {
    const offsetMin = tzOffsetMinutes(new Date(candidate), timeZone);
    candidate = naiveUtcMs - offsetMin * 60_000;
  }
  return new Date(candidate);
}

/** Formats a UTC ISO instant for display in the tenant's timezone —
 * `Intl.DateTimeFormat` does the real IANA-aware conversion. */
export function toTenantLocalDisplay(utcIso: string, timeZone: string, locale: string = 'en'): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO datetime: ${utcIso}`);
  }
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
