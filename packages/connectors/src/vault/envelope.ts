import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Credential vault — envelope encryption primitives (prompt.md constraint #3 /
 * implentationplanphase.md task 3.2). Pure crypto, no I/O, no Prisma: apps/api's
 * `CredentialVaultService` is the only caller that touches the database, wrapping
 * these functions around a per-tenant `TenantDataKey` row and a `Credential` row.
 *
 * Scheme: AES-256-GCM everywhere.
 *  - `KMS_MASTER_KEY` (a base64 32-byte value, per env.ts) never touches a
 *    `Credential` row directly. It only wraps (encrypts) a per-tenant Data
 *    Encryption Key (DEK) — classic envelope encryption. Rotating the master
 *    key means re-wrapping every tenant's DEK, NOT re-encrypting every secret.
 *  - Each `Credential.encryptedBlob` is the plaintext secret encrypted under
 *    that tenant's DEK with a fresh random IV per call — never a fixed IV,
 *    never ECB, never a deterministic scheme that would leak equality.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit GCM nonce, the NIST-recommended size
const KEY_LENGTH = 32; // AES-256

/** Derives a fixed-length AES-256 key from the configured master key string
 * (which may be any length/encoding) via SHA-256 — matches how env.ts's
 * `KMS_MASTER_KEY` default value (a base64 string, not necessarily 32 raw
 * bytes once decoded) is used elsewhere in this codebase for MFA-adjacent
 * secrets. Never logged; only ever held in memory for the duration of one
 * encrypt/decrypt call. */
function deriveKey(masterKeyMaterial: string): Buffer {
  return createHash('sha256').update(masterKeyMaterial, 'utf8').digest();
}

function encryptRaw(plaintext: Buffer, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // wire format: base64(iv || tag || ciphertext) — self-contained, no side table needed
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptRaw(payload: string, key: Buffer): Buffer {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Generates a fresh 256-bit per-tenant Data Encryption Key. */
export function generateDek(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/** Wraps (encrypts) a tenant's DEK under the KMS master key — stored as
 * `TenantDataKey.wrappedDek`. Never store the unwrapped DEK at rest. */
export function wrapDek(dek: Buffer, masterKeyMaterial: string): string {
  return encryptRaw(dek, deriveKey(masterKeyMaterial));
}

/** Unwraps a tenant's DEK. The result must never be logged or persisted —
 * callers should hold it only for the duration of one encrypt/decrypt call. */
export function unwrapDek(wrapped: string, masterKeyMaterial: string): Buffer {
  return decryptRaw(wrapped, deriveKey(masterKeyMaterial));
}

/** Encrypts a plaintext secret under a tenant's (already-unwrapped) DEK. */
export function encryptSecret(plaintext: string, dek: Buffer): string {
  return encryptRaw(Buffer.from(plaintext, 'utf8'), dek);
}

/** Decrypts a `Credential.encryptedBlob` back to plaintext. Callers must treat
 * the return value as sensitive: never log it, never include it in an API
 * response, never send it to a browser/mobile client (prompt.md constraint #3). */
export function decryptSecret(encrypted: string, dek: Buffer): string {
  return decryptRaw(encrypted, dek).toString('utf8');
}

/** Rewraps a DEK under a new master key material — the whole point of key
 * rotation (featureslist.md 4.4's "key rotation"): re-wrap once per tenant,
 * never touch the underlying `Credential` rows. */
export function rewrapDek(wrapped: string, oldMasterKeyMaterial: string, newMasterKeyMaterial: string): string {
  const dek = unwrapDek(wrapped, oldMasterKeyMaterial);
  return wrapDek(dek, newMasterKeyMaterial);
}

/**
 * Masked display hint (prompt.md: `sk_live_••••4821`). Shows a short,
 * recognisable prefix (if the secret looks like a provider-prefixed key) plus
 * the last 4 characters — never enough to reconstruct or brute-force-narrow
 * the secret, only enough for a human to recognise which credential is which.
 */
export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) {
    return '••••';
  }
  const prefixMatch = /^[A-Za-z]+_[A-Za-z]+_/.exec(trimmed) ?? /^[A-Za-z]{2,10}_/.exec(trimmed);
  const prefix = prefixMatch !== null ? prefixMatch[0] : '';
  const tail = trimmed.slice(-4);
  return `${prefix}••••${tail}`;
}

/**
 * Test/ops helper: proves a raw secret does not appear verbatim inside an
 * arbitrary string (a serialized log line, an error message, a JSON response
 * body). Used by the "no-log assertion" test (implentationplanphase.md task
 * 3.2) — NOT a runtime guard by itself; the real guard is "never pass the
 * plaintext to the logger", this only verifies that discipline held.
 */
export function assertSecretNotPresent(haystack: string, secret: string): void {
  if (secret.length > 0 && haystack.includes(secret)) {
    throw new Error('Raw secret value found in output that must never contain it');
  }
}
