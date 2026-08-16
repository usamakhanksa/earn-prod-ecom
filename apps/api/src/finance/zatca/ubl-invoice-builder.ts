/**
 * ZATCA Phase-2 UBL 2.1 XML invoice builder (task 6.8, featureslist.md 9.9).
 *
 * STANDARDS BASIS: the core UBL 2.1 element set below (namespaces, `cbc:ID`,
 * `cbc:UUID`, `cbc:IssueDate`/`IssueTime`, `cbc:InvoiceTypeCode`,
 * `cbc:DocumentCurrencyCode`, `cac:AccountingSupplierParty`/
 * `AccountingCustomerParty` with `cac:PartyTaxScheme`, `cac:TaxTotal`/
 * `cac:TaxSubtotal`/`cac:TaxCategory`, `cac:LegalMonetaryTotal`,
 * `cac:InvoiceLine`, and the QR embedded via
 * `cac:AdditionalDocumentReference[cbc:ID='QR']/cac:Attachment/
 * cbc:EmbeddedDocumentBinaryObject`) matches the structure documented across
 * ZATCA's own "E-invoicing Detailed Technical Guidelines" and multiple
 * independent open-source ZATCA implementations (confirmed via WebSearch
 * this pass — see docs/CONNECTORS.md/docs/DEBT.md for the exact citation
 * trail).
 *
 * WHAT IS **NOT** INDEPENDENTLY VERIFIED (documented honestly, not hidden):
 *  - This has never been run through ZATCA's own XSD/Schematron validator —
 *    that requires ZATCA's own SDK/validation tool, unavailable here.
 *  - The full XAdES `<ds:Signature>` envelope ZATCA requires inside
 *    `ext:UBLExtensions` (per ETSI EN 319 132-1) is NOT built — this
 *    function embeds the QR (tags 1-8, real TLV/crypto — see
 *    `tlv-qr.util.ts`/`zatca-crypto.util.ts`) but does not produce a full
 *    XML-embedded digital signature block.
 *  - Attribute/child ORDERING and exact cardinality rules from ZATCA's
 *    Schematron business rules (e.g. BR-KSA-*) are not enforced here.
 *
 * This is the most standards-faithful implementation achievable without a
 * live ZATCA account/SDK, not a byte-exact, ZATCA-certified artefact.
 */

export interface UblInvoiceLineInput {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: bigint;
  lineExtensionMinor: bigint;
  taxRatePct: number;
  taxMinor: bigint;
}

export interface UblInvoiceInput {
  invoiceNumber: string;
  uuid: string;
  issueDateIso: string; // YYYY-MM-DD
  issueTimeIso: string; // HH:mm:ss
  invoiceTypeCode: string; // "388" standard invoice, "381" credit note
  invoiceSubtypeName: string; // ZATCA's 7-digit name attribute, e.g. "0200000" (simplified, no other flags)
  currency: string;
  sellerName: string;
  sellerVatNumber: string;
  buyerName?: string;
  buyerVatNumber?: string;
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  lines: UblInvoiceLineInput[];
  qrTlvBase64: string;
}

function money(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const str = abs.toString().padStart(3, '0');
  const value = `${str.slice(0, -2)}.${str.slice(-2)}`;
  return negative ? `-${value}` : value;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildUblInvoiceXml(input: UblInvoiceInput): string {
  const lines = input.lines
    .map(
      (line) => `
  <cac:InvoiceLine>
    <cbc:ID>${escapeXml(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity>${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${money(line.lineExtensionMinor)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${input.currency}">${money(line.taxMinor)}</cbc:TaxAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.description)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${input.currency}">${money(line.unitPriceMinor)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${input.uuid}</cbc:UUID>
  <cbc:IssueDate>${input.issueDateIso}</cbc:IssueDate>
  <cbc:IssueTime>${input.issueTimeIso}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${input.invoiceSubtypeName}">${input.invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${input.currency}</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${input.qrTlvBase64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(input.sellerVatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${input.buyerVatNumber !== undefined ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(input.buyerVatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.buyerName ?? 'Unknown Buyer')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${money(input.taxMinor)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${input.currency}">${money(input.subtotalMinor)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${input.currency}">${money(input.taxMinor)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${input.subtotalMinor > 0n ? ((Number(input.taxMinor) / Number(input.subtotalMinor)) * 100).toFixed(2) : '0.00'}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${money(input.subtotalMinor)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${input.currency}">${money(input.subtotalMinor)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${money(input.totalMinor)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${money(input.totalMinor)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;
}
