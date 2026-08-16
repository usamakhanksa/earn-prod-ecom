/**
 * Carrier tracking-link generation (task 5.5) — a small, honest set of
 * well-known public carrier tracking URL templates. Unknown carriers fall
 * back to `null` rather than a guessed URL (prompt.md constraint #2's "never
 * guess" spirit applied to carrier URLs, not just connector endpoints).
 */
const CARRIER_URL_TEMPLATES: Record<string, (trackingNumber: string) => string> = {
  usps: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  ups: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  dhl: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
  'dhl-express': (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
  royal_mail: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  canada_post: (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(n)}`,
  australia_post: (n) => `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(n)}`,
};

export function buildCarrierTrackingUrl(carrier: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (carrier === null || carrier === undefined || trackingNumber === null || trackingNumber === undefined || trackingNumber.length === 0) {
    return null;
  }
  const key = carrier.trim().toLowerCase().replace(/\s+/g, '_');
  const template = CARRIER_URL_TEMPLATES[key];
  return template === undefined ? null : template(trackingNumber);
}

/** ETA calculation (task 5.5) — `shippedAt + carrier/service-class transit
 * days`. A pure, simple estimate (no live carrier-API rate lookup exists in
 * this codebase) — real per-carrier transit times are Phase 6+/live-carrier-
 * API scope; this is a reasonable default so the UI has *something* honest
 * to show rather than nothing. */
export function estimateDeliveryDate(shippedAt: Date, transitDays = 5): Date {
  const eta = new Date(shippedAt);
  eta.setUTCDate(eta.getUTCDate() + transitDays);
  return eta;
}
