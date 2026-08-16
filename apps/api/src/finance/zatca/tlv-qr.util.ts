/**
 * ZATCA Phase-2 QR code: TLV (tag-length-value) encoding, base64-wrapped
 * (implentationplanphase.md task 6.8, featureslist.md 9.9).
 *
 * STANDARDS BASIS (docs/DEBT.md documents this precisely): tag numbers/
 * meanings below were confirmed via ZATCA's own published "Guide to
 * Developed FATOORA Compliant QR Code" (zatca.gov.sa/.../QRCodeCreation.pdf)
 * and ZATCA's "Electronic Invoice Security Features Implementation
 * Standards" (v1.2, zatca.gov.sa), retrieved via WebSearch in this pass —
 * NOT invented from memory:
 *   1 = Seller name (UTF-8 text)
 *   2 = Seller VAT registration number (15-digit text)
 *   3 = Invoice timestamp (ISO 8601 text)
 *   4 = Invoice total WITH VAT (text)
 *   5 = VAT total (text)
 *   6 = Hash of the invoice XML (base64 text of the SHA-256 digest)
 *   7 = ECDSA signature of the invoice hash (base64 text)
 *   8 = ECDSA public key used to produce that signature (base64 text)
 *   9 = ZATCA-issued certificate/compliance-CSID signature over the
 *       cryptographic stamp (simplified invoices) — DELIBERATELY OMITTED
 *       here: producing a real tag 9 requires a certificate ZATCA itself
 *       issues through a live CSID/compliance-CSID onboarding call this
 *       sandbox cannot make (no live ZATCA account, docs/DEBT.md). Tags 1-8
 *       are genuinely computed from real data.
 *
 * Encoding: each field is one TAG byte + one LENGTH byte (the UTF-8 byte
 * length of the value, so this format tops out at 255 bytes per field —
 * matches every source found) + the UTF-8-encoded VALUE bytes, concatenated
 * with no separator, and the whole byte string is base64-encoded once at
 * the end.
 */

export interface ZatcaQrFields {
  sellerName: string;
  sellerVatNumber: string;
  invoiceTimestampIso: string;
  invoiceTotalWithVat: string;
  vatTotal: string;
  invoiceHashBase64: string;
  signatureBase64: string;
  publicKeyBase64: string;
}

function encodeTlvField(tag: number, value: string): Buffer {
  const valueBytes = Buffer.from(value, 'utf8');
  if (valueBytes.length > 255) {
    throw new Error(`ZATCA TLV field (tag ${tag}) exceeds the 255-byte single-length-byte limit`);
  }
  return Buffer.concat([Buffer.from([tag]), Buffer.from([valueBytes.length]), valueBytes]);
}

export function buildZatcaQrTlvBase64(fields: ZatcaQrFields): string {
  const buffer = Buffer.concat([
    encodeTlvField(1, fields.sellerName),
    encodeTlvField(2, fields.sellerVatNumber),
    encodeTlvField(3, fields.invoiceTimestampIso),
    encodeTlvField(4, fields.invoiceTotalWithVat),
    encodeTlvField(5, fields.vatTotal),
    encodeTlvField(6, fields.invoiceHashBase64),
    encodeTlvField(7, fields.signatureBase64),
    encodeTlvField(8, fields.publicKeyBase64),
  ]);
  return buffer.toString('base64');
}

/** Decodes a TLV base64 payload back into its tagged fields — used by this
 * service's own round-trip unit test to prove the encoding is self-consistent
 * (a real, mechanical proof of "the QR payload decodes to what was put in",
 * independent of whether a phone's camera app can scan the rendered image,
 * which this sandbox cannot verify — see docs/DEBT.md). */
export function decodeZatcaQrTlvBase64(base64: string): Array<{ tag: number; value: string }> {
  const buffer = Buffer.from(base64, 'base64');
  const fields: Array<{ tag: number; value: string }> = [];
  let offset = 0;
  while (offset < buffer.length) {
    const tag = buffer[offset];
    const length = buffer[offset + 1];
    if (tag === undefined || length === undefined) {
      throw new Error('Malformed ZATCA TLV payload: truncated tag/length header');
    }
    const value = buffer.subarray(offset + 2, offset + 2 + length).toString('utf8');
    fields.push({ tag, value });
    offset += 2 + length;
  }
  return fields;
}
