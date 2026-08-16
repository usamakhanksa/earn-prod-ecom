import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceRepository, type InvoiceWithLines } from '../../repositories/invoice.repository';
import { OrderRepository } from '../../repositories/order.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { FeatureFlagService } from '../../feature-flags/feature-flag.service';
import { buildZatcaQrTlvBase64 } from './tlv-qr.util';
import { generateZatcaKeyPair, sha256Base64, signInvoiceHash } from './zatca-crypto.util';
import { buildUblInvoiceXml } from './ubl-invoice-builder';

/**
 * ZATCA Phase-2 e-invoicing orchestrator (task 6.8), gated behind the
 * `zatca_einvoicing` feature flag (reusing Phase 1's `FeatureFlagService`,
 * per prompt.md's SPECIAL INSTRUCTIONS section).
 *
 * Pipeline: build the UBL 2.1 XML (without the QR first) -> hash it (SHA-256)
 * -> sign the hash (local secp256k1 keypair) -> build the TLV/base64 QR (tags
 * 1-8) -> rebuild the XML WITH the QR embedded -> persist `Invoice` +
 * `InvoiceLine` + `ZatcaInvoiceMeta`. `clearanceStatus` stays
 * `'NOT_SUBMITTED'` — this service never calls a live ZATCA clearance/
 * reporting API (no such endpoint/credentials exist in this sandbox; see
 * `ubl-invoice-builder.ts`/`zatca-crypto.util.ts` for the precise
 * standards-verified-vs-best-effort breakdown).
 */
@Injectable()
export class ZatcaInvoiceService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly orders: OrderRepository,
    private readonly tenants: TenantRepository,
    private readonly flags: FeatureFlagService,
  ) {}

  async generateForOrder(tenantId: string, orderId: string, actorId: string, buyerVatNumber?: string): Promise<InvoiceWithLines> {
    const enabled = await this.flags.isEnabledForTenant(tenantId, 'zatca_einvoicing');
    if (!enabled) {
      throw new ForbiddenException({ message: 'ZATCA e-invoicing is not enabled for this tenant (flag: zatca_einvoicing)', code: 'zatca_not_enabled' });
    }
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const tenant = await this.tenants.findById(tenantId);
    if (tenant?.vatNumber === null || tenant?.vatNumber === undefined) {
      throw new ForbiddenException({ message: 'Set this tenant\'s VAT registration number before generating a ZATCA invoice', code: 'zatca_seller_vat_missing' });
    }

    const invoiceNumber = await this.invoices.nextInvoiceNumber(tenantId);
    const uuid = randomUUID();
    const now = new Date();
    const issueDateIso = now.toISOString().slice(0, 10);
    const issueTimeIso = now.toISOString().slice(11, 19);

    const lines = order.items.map((item, index) => ({
      id: String(index + 1),
      description: item.title,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineExtensionMinor: item.totalPriceMinor,
      taxRatePct: order.subtotalMinor > 0n ? (Number(order.taxMinor) / Number(order.subtotalMinor)) * 100 : 0,
      taxMinor: order.subtotalMinor > 0n ? (item.totalPriceMinor * order.taxMinor) / order.subtotalMinor : 0n,
    }));

    const baseInput = {
      invoiceNumber,
      uuid,
      issueDateIso,
      issueTimeIso,
      invoiceTypeCode: '388',
      invoiceSubtypeName: '0200000', // simplified tax invoice, no special flags — see ubl-invoice-builder.ts doc comment
      currency: order.currency,
      sellerName: tenant.name,
      sellerVatNumber: tenant.vatNumber,
      ...(order.buyerName !== null ? { buyerName: order.buyerName } : {}),
      ...(buyerVatNumber !== undefined ? { buyerVatNumber } : {}),
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      lines,
    };

    // Hash/sign the XML BEFORE the QR is embedded (the QR itself depends on
    // the hash/signature, so it cannot be part of what gets hashed).
    const unsignedXml = buildUblInvoiceXml({ ...baseInput, qrTlvBase64: '' });
    const invoiceHashBase64 = sha256Base64(unsignedXml);
    const keyPair = generateZatcaKeyPair();
    const signatureBase64 = signInvoiceHash(invoiceHashBase64, keyPair.privateKey);
    const publicKeyBase64 = keyPair.publicKeyDer.toString('base64');

    const qrTlvBase64 = buildZatcaQrTlvBase64({
      sellerName: tenant.name,
      sellerVatNumber: tenant.vatNumber,
      invoiceTimestampIso: now.toISOString(),
      invoiceTotalWithVat: minorToDecimalString(order.totalMinor),
      vatTotal: minorToDecimalString(order.taxMinor),
      invoiceHashBase64,
      signatureBase64,
      publicKeyBase64,
    });

    const finalXml = buildUblInvoiceXml({ ...baseInput, qrTlvBase64 });

    const invoice = await this.invoices.createWithLines(
      {
        tenantId,
        orderId,
        invoiceNumber,
        type: 'SIMPLIFIED',
        status: 'ISSUED',
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        buyerName: order.buyerName,
        buyerVatNumber: buyerVatNumber ?? null,
        sellerVatNumber: tenant.vatNumber,
        issuedAt: now,
        createdById: actorId,
      },
      lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRatePct: line.taxRatePct,
        taxMinor: line.taxMinor,
        totalMinor: line.lineExtensionMinor + line.taxMinor,
      })),
    );

    await this.invoices.attachZatca(invoice.id, {
      tenantId,
      uuid,
      invoiceHash: invoiceHashBase64,
      qrTlvBase64,
      signatureBase64,
      publicKeyBase64,
      ublXml: finalXml,
      clearanceStatus: 'NOT_SUBMITTED',
    });

    const withZatca = await this.invoices.findById(tenantId, invoice.id);
    if (withZatca === null) {
      throw new NotFoundException({ message: 'Invoice not found after creation', code: 'INVOICE_NOT_FOUND' });
    }
    return withZatca;
  }
}

function minorToDecimalString(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const str = abs.toString().padStart(3, '0');
  const value = `${str.slice(0, -2)}.${str.slice(-2)}`;
  return negative ? `-${value}` : value;
}
