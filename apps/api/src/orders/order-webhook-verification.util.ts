import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Generic inbound-webhook HMAC verification (prompt.md constraint #5 —
 * "every inbound webhook is deduplicated by provider event ID" plus the
 * general "signature-verified" requirement on `POST /hooks/:slug`). Tries
 * the header names/encodings the connector adapters' own doc comments flag
 * as real per provider (Shopify: `X-Shopify-Hmac-Sha256`, base64;
 * WooCommerce: `X-WC-Webhook-Signature`, base64; a generic
 * `X-Hub-Signature-256`, hex, covers several others) without assuming one
 * exact shape.
 *
 * HONEST GAP (docs/DEBT.md): the "secret" this compares against is whatever
 * decrypted credential material `AdapterRunnerService.resolve` hands back
 * for the connection — there is no dedicated `webhookSecret` field on
 * `Connection`/`Credential` yet (Shopify/WooCommerce webhook secrets are, in
 * a real production setup, often DIFFERENT from the API credential). This
 * function is real, working HMAC verification — it is just being fed a
 * stand-in key until a dedicated field exists.
 */
export function verifyWebhookSignature(headers: Record<string, string>, rawBody: string, secret: string): boolean {
  if (secret.length === 0) {
    return false;
  }
  const lower = lowercaseKeys(headers);
  const shopify = lower['x-shopify-hmac-sha256'];
  if (shopify !== undefined) {
    return safeCompareBase64(computeHmacBase64(rawBody, secret), shopify);
  }
  const woo = lower['x-wc-webhook-signature'];
  if (woo !== undefined) {
    return safeCompareBase64(computeHmacBase64(rawBody, secret), woo);
  }
  const generic = lower['x-hub-signature-256'];
  if (generic !== undefined) {
    const provided = generic.startsWith('sha256=') ? generic.slice('sha256='.length) : generic;
    return safeCompareHex(computeHmacHex(rawBody, secret), provided);
  }
  return false;
}

export function computeHmacBase64(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
}

export function computeHmacHex(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

function safeCompareBase64(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected, 'base64');
    const b = Buffer.from(actual, 'base64');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeCompareHex(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(actual, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}
