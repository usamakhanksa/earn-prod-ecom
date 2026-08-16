import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { buildZatcaQrTlvBase64, decodeZatcaQrTlvBase64 } from '../src/finance/zatca/tlv-qr.util';
import { generateZatcaKeyPair, sha256Base64, signInvoiceHash, verifyInvoiceSignature } from '../src/finance/zatca/zatca-crypto.util';
import { buildUblInvoiceXml } from '../src/finance/zatca/ubl-invoice-builder';

describe('ZATCA TLV QR encoding', () => {
  it('round-trips every field through encode/decode unchanged', () => {
    const fields = {
      sellerName: 'OmniSell Test Merchant',
      sellerVatNumber: '300000000000003',
      invoiceTimestampIso: '2026-08-16T10:00:00.000Z',
      invoiceTotalWithVat: '115.00',
      vatTotal: '15.00',
      invoiceHashBase64: sha256Base64('some invoice content'),
      signatureBase64: 'dGVzdC1zaWduYXR1cmU=',
      publicKeyBase64: 'dGVzdC1wdWJsaWMta2V5',
    };
    const tlvBase64 = buildZatcaQrTlvBase64(fields);
    const decoded = decodeZatcaQrTlvBase64(tlvBase64);
    expect(decoded).toEqual([
      { tag: 1, value: fields.sellerName },
      { tag: 2, value: fields.sellerVatNumber },
      { tag: 3, value: fields.invoiceTimestampIso },
      { tag: 4, value: fields.invoiceTotalWithVat },
      { tag: 5, value: fields.vatTotal },
      { tag: 6, value: fields.invoiceHashBase64 },
      { tag: 7, value: fields.signatureBase64 },
      { tag: 8, value: fields.publicKeyBase64 },
    ]);
  });

  it('rejects a field value longer than the single-length-byte limit', () => {
    expect(() =>
      buildZatcaQrTlvBase64({
        sellerName: 'x'.repeat(256),
        sellerVatNumber: '1',
        invoiceTimestampIso: '2026-01-01T00:00:00Z',
        invoiceTotalWithVat: '0.00',
        vatTotal: '0.00',
        invoiceHashBase64: 'h',
        signatureBase64: 's',
        publicKeyBase64: 'p',
      }),
    ).toThrow(/255-byte/);
  });

  it('a real QR-decoding algorithm (jsQR) can actually read the rendered QR image — this is the closest this sandbox can get to "the QR scans" without a physical phone camera', async () => {
    const tlvBase64 = buildZatcaQrTlvBase64({
      sellerName: 'OmniSell Test Merchant',
      sellerVatNumber: '300000000000003',
      invoiceTimestampIso: new Date().toISOString(),
      invoiceTotalWithVat: '115.00',
      vatTotal: '15.00',
      invoiceHashBase64: sha256Base64('invoice-xml-content'),
      signatureBase64: 'dGVzdC1zaWduYXR1cmU=',
      publicKeyBase64: 'dGVzdC1wdWJsaWMta2V5',
    });

    const png = await QRCode.toBuffer(tlvBase64, { type: 'png', margin: 1, width: 220 });
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    expect(decoded).not.toBeNull();
    expect(decoded?.data).toBe(tlvBase64);
  });
});

describe('ZATCA cryptographic stamp (secp256k1 ECDSA)', () => {
  it('signs and verifies a real signature over a real SHA-256 hash', () => {
    const keyPair = generateZatcaKeyPair();
    const xml = '<Invoice>real content</Invoice>';
    const hash = sha256Base64(xml);
    const signature = signInvoiceHash(hash, keyPair.privateKey);
    expect(verifyInvoiceSignature(hash, signature, keyPair.publicKey)).toBe(true);
  });

  it('fails verification against a tampered hash', () => {
    const keyPair = generateZatcaKeyPair();
    const signature = signInvoiceHash(sha256Base64('original'), keyPair.privateKey);
    expect(verifyInvoiceSignature(sha256Base64('tampered'), signature, keyPair.publicKey)).toBe(false);
  });

  it('fails verification against a different keypair\'s public key', () => {
    const keyPairA = generateZatcaKeyPair();
    const keyPairB = generateZatcaKeyPair();
    const hash = sha256Base64('content');
    const signature = signInvoiceHash(hash, keyPairA.privateKey);
    expect(verifyInvoiceSignature(hash, signature, keyPairB.publicKey)).toBe(false);
  });
});

describe('UBL 2.1 invoice XML builder', () => {
  it('produces well-formed XML containing the required UBL elements and the embedded QR', () => {
    const xml = buildUblInvoiceXml({
      invoiceNumber: 'INV-2026-000001',
      uuid: '11111111-1111-1111-1111-111111111111',
      issueDateIso: '2026-08-16',
      issueTimeIso: '10:00:00',
      invoiceTypeCode: '388',
      invoiceSubtypeName: '0200000',
      currency: 'SAR',
      sellerName: 'OmniSell Test Merchant',
      sellerVatNumber: '300000000000003',
      buyerName: 'Test Buyer',
      subtotalMinor: 10_000n,
      taxMinor: 1_500n,
      totalMinor: 11_500n,
      lines: [{ id: '1', description: 'Widget', quantity: 2, unitPriceMinor: 5_000n, lineExtensionMinor: 10_000n, taxRatePct: 15, taxMinor: 1_500n }],
      qrTlvBase64: 'ZmFrZS1xci1wYXlsb2Fk',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
    expect(xml).toContain('<cbc:ID>INV-2026-000001</cbc:ID>');
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">ZmFrZS1xci1wYXlsb2Fk</cbc:EmbeddedDocumentBinaryObject>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="SAR">115.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cac:InvoiceLine>');
    expect(xml).toContain('Widget');
  });

  it('escapes XML-unsafe characters in text fields', () => {
    const xml = buildUblInvoiceXml({
      invoiceNumber: 'INV & Co <test>',
      uuid: '11111111-1111-1111-1111-111111111111',
      issueDateIso: '2026-08-16',
      issueTimeIso: '10:00:00',
      invoiceTypeCode: '388',
      invoiceSubtypeName: '0200000',
      currency: 'SAR',
      sellerName: 'Seller',
      sellerVatNumber: '1',
      subtotalMinor: 100n,
      taxMinor: 0n,
      totalMinor: 100n,
      lines: [],
      qrTlvBase64: '',
    });
    expect(xml).toContain('INV &amp; Co &lt;test&gt;');
    expect(xml).not.toContain('INV & Co <test>');
  });
});
