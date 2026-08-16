import { createHash, createSign, createVerify, generateKeyPairSync, type KeyObject } from 'node:crypto';

/**
 * ZATCA cryptographic stamp primitives (task 6.8). Confirmed via WebSearch
 * this pass against ZATCA's own "Electronic Invoice Security Features
 * Implementation Standards" (v1.2, zatca.gov.sa): the Cryptographic Stamp
 * uses ECDSA over the `secp256k1` curve.
 *
 * HONEST GAP (docs/DEBT.md): ZATCA's real signature is produced under a
 * certificate ZATCA itself issues through a live CSID/compliance-CSID
 * onboarding call (and for a full XML envelope, an XAdES `<ds:Signature>`
 * per ETSI EN 319 132-1) — neither is reachable from this sandbox (no live
 * ZATCA account). What IS implemented here is genuinely real cryptography:
 * a real secp256k1 keypair, a real SHA-256 hash of the invoice content, and
 * a real ECDSA signature of that hash — verifiable with the accompanying
 * public key — just under a LOCALLY GENERATED keypair rather than a
 * ZATCA-issued certificate chain. This is the same "real code, unverified
 * against the live external system" honesty standard every connector
 * adapter in this codebase already carries (e.g. docs/DEBT.md 3-D1).
 */

export interface ZatcaKeyPair {
  publicKeyDer: Buffer;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/** Generates a fresh secp256k1 keypair. In a real deployment this would be
 * generated ONCE per tenant/device during ZATCA onboarding and persisted —
 * this phase generates one per invoice for simplicity (documented as a
 * simplification; a real implementation should persist and reuse the
 * onboarded keypair across invoices, since ZATCA's compliance CSID is
 * issued for a specific public key, not reissued per invoice). */
export function generateZatcaKeyPair(): ZatcaKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  return { publicKeyDer, privateKey, publicKey };
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function sha256Base64(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('base64');
}

/** Signs the SHA-256 hash of `content` with the given private key,
 * returning a base64 DER-encoded ECDSA signature. */
export function signInvoiceHash(content: string, privateKey: KeyObject): string {
  const signer = createSign('SHA256');
  signer.update(content, 'utf8');
  signer.end();
  return signer.sign(privateKey).toString('base64');
}

/** Verifies a signature produced by `signInvoiceHash` — used by this
 * module's own unit test to prove the sign/verify round-trip is internally
 * consistent (real cryptography, independently checked), separate from
 * whether ZATCA's own systems would accept it (they would not, absent a
 * real CSID certificate — see this file's doc comment). */
export function verifyInvoiceSignature(content: string, signatureBase64: string, publicKey: KeyObject): boolean {
  const verifier = createVerify('SHA256');
  verifier.update(content, 'utf8');
  verifier.end();
  return verifier.verify(publicKey, Buffer.from(signatureBase64, 'base64'));
}
