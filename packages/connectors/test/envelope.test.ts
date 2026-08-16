import { describe, expect, it } from 'vitest';
import {
  assertSecretNotPresent,
  decryptSecret,
  encryptSecret,
  generateDek,
  maskSecret,
  rewrapDek,
  unwrapDek,
  wrapDek,
} from '../src/vault/envelope';

const MASTER_KEY_A = 'aGVyZS1pcy0zMi1ieXRlLWJhc2U2NC1rZXktZmVkY2Jh';
const MASTER_KEY_B = 'a-completely-different-rotated-master-key-value';

describe('envelope encryption — credential vault (prompt.md constraint #3)', () => {
  it('round-trips a secret through generate → wrap → unwrap → encrypt → decrypt', () => {
    const dek = generateDek();
    const wrapped = wrapDek(dek, MASTER_KEY_A);
    const unwrapped = unwrapDek(wrapped, MASTER_KEY_A);
    expect(unwrapped.equals(dek)).toBe(true);

    const secret = 'sk_live_51H8x9aBcDeFgHiJkLmNoPqR4821';
    const ciphertext = encryptSecret(secret, unwrapped);
    expect(ciphertext).not.toContain(secret);
    expect(decryptSecret(ciphertext, unwrapped)).toBe(secret);
  });

  it('produces a different ciphertext every time (random IV, no ECB-style determinism)', () => {
    const dek = generateDek();
    const a = encryptSecret('same-secret-value', dek);
    const b = encryptSecret('same-secret-value', dek);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong DEK (authenticated encryption catches tampering/wrong-key use)', () => {
    const dekA = generateDek();
    const dekB = generateDek();
    const ciphertext = encryptSecret('top-secret', dekA);
    expect(() => decryptSecret(ciphertext, dekB)).toThrow();
  });

  it('fails to unwrap a DEK with the wrong master key', () => {
    const dek = generateDek();
    const wrapped = wrapDek(dek, MASTER_KEY_A);
    expect(() => unwrapDek(wrapped, MASTER_KEY_B)).toThrow();
  });

  it('rotates a wrapped DEK to a new master key without touching the underlying secret', () => {
    const dek = generateDek();
    const wrappedUnderA = wrapDek(dek, MASTER_KEY_A);
    const secret = 'rotate-me-please';
    const ciphertext = encryptSecret(secret, dek);

    const wrappedUnderB = rewrapDek(wrappedUnderA, MASTER_KEY_A, MASTER_KEY_B);
    const dekAfterRotation = unwrapDek(wrappedUnderB, MASTER_KEY_B);

    expect(dekAfterRotation.equals(dek)).toBe(true);
    expect(decryptSecret(ciphertext, dekAfterRotation)).toBe(secret); // never re-encrypted, still valid
    expect(() => unwrapDek(wrappedUnderB, MASTER_KEY_A)).toThrow(); // old master key no longer works
  });
});

describe('maskSecret — display hints (prompt.md: "sk_live_••••4821")', () => {
  it('keeps a recognisable prefix and the last 4 characters only', () => {
    expect(maskSecret('sk_live_51H8x9aBcDeFgHiJkLmNoPqR4821')).toBe('sk_live_••••4821');
  });

  it('handles a plain PAT with no prefix', () => {
    const masked = maskSecret('printify_pat_abcdef1234');
    expect(masked.endsWith('••••1234')).toBe(true);
    expect(masked).not.toContain('abcdef');
  });

  it('never reveals more than the last 4 characters', () => {
    const secret = 'X-API-Key-super-secret-value-0099';
    const masked = maskSecret(secret);
    expect(masked).not.toContain(secret.slice(0, secret.length - 4));
  });

  it('degrades gracefully for very short values', () => {
    expect(maskSecret('ab')).toBe('••••');
  });
});

describe('no-log assertion (implentationplanphase.md task 3.2)', () => {
  it('proves a raw secret never appears in a representative logged/serialized string', () => {
    const secret = 'sk_live_51H8x9aBcDeFgHiJkLmNoPqR4821';
    const dek = generateDek();
    const encrypted = encryptSecret(secret, dek);
    const maskedHint = maskSecret(secret);

    // Simulates the kind of object apps/api's Pino logger or an audit-log
    // `after` snapshot would actually serialize for a Connection/Credential
    // mutation — the encrypted blob and the masked hint are fine to log; the
    // plaintext secret must never be one of the values that ends up in it.
    const representativeLogLine = JSON.stringify({
      event: 'connection.credential.rotate',
      tenantId: 't_123',
      connectionId: 'conn_456',
      encryptedBlob: encrypted,
      maskedHint,
      rotatedAt: new Date().toISOString(),
    });

    expect(() => assertSecretNotPresent(representativeLogLine, secret)).not.toThrow();
  });

  it('the assertion helper itself actually catches a leak (proves it is not a no-op)', () => {
    const secret = 'sk_live_should_never_appear_raw';
    const leakyLogLine = `About to store credential value=${secret} for tenant t_1`;
    expect(() => assertSecretNotPresent(leakyLogLine, secret)).toThrow();
  });
});
