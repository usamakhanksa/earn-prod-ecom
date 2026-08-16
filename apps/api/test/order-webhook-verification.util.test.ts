import { describe, expect, it } from 'vitest';
import { computeHmacBase64, computeHmacHex, verifyWebhookSignature } from '../src/orders/order-webhook-verification.util';

describe('inbound webhook HMAC verification (prompt.md constraint #5)', () => {
  const secret = 'test-secret';
  const rawBody = JSON.stringify({ id: 123, status: 'paid' });

  it('accepts a correctly-signed Shopify-style header (base64)', () => {
    const signature = computeHmacBase64(rawBody, secret);
    expect(verifyWebhookSignature({ 'X-Shopify-Hmac-Sha256': signature }, rawBody, secret)).toBe(true);
  });

  it('accepts a correctly-signed WooCommerce-style header (base64)', () => {
    const signature = computeHmacBase64(rawBody, secret);
    expect(verifyWebhookSignature({ 'X-WC-Webhook-Signature': signature }, rawBody, secret)).toBe(true);
  });

  it('accepts a correctly-signed generic hub-signature header (hex, sha256= prefix)', () => {
    const signature = computeHmacHex(rawBody, secret);
    expect(verifyWebhookSignature({ 'X-Hub-Signature-256': `sha256=${signature}` }, rawBody, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = computeHmacBase64(rawBody, secret);
    expect(verifyWebhookSignature({ 'X-Shopify-Hmac-Sha256': signature }, rawBody + 'tampered', secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const signature = computeHmacBase64(rawBody, secret);
    expect(verifyWebhookSignature({ 'X-Shopify-Hmac-Sha256': signature }, rawBody, 'wrong-secret')).toBe(false);
  });

  it('rejects when no recognised signature header is present', () => {
    expect(verifyWebhookSignature({}, rawBody, secret)).toBe(false);
  });

  it('rejects when the secret is empty', () => {
    const signature = computeHmacBase64(rawBody, '');
    expect(verifyWebhookSignature({ 'X-Shopify-Hmac-Sha256': signature }, rawBody, '')).toBe(false);
  });
});
