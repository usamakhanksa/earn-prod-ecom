import { Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { TenantRepository } from '../../repositories/tenant.repository';

const LABELS = {
  en: { title: 'Simplified Tax Invoice', invoiceNo: 'Invoice No.', vatNumber: 'VAT No.', subtotal: 'Subtotal', vat: 'VAT', total: 'Total (incl. VAT)', qrHint: 'Scan to verify (ZATCA TLV payload)' },
  ar: { title: 'فاتورة ضريبية مبسطة', invoiceNo: 'رقم الفاتورة', vatNumber: 'الرقم الضريبي', subtotal: 'المجموع الفرعي', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي شامل الضريبة', qrHint: 'امسح للتحقق (بيانات ZATCA)' },
} as const;

/**
 * Bilingual ZATCA invoice PDF (task 6.8), reusing Phase 5's `pdf-lib`
 * pipeline (`PackingSlipService`'s pattern) plus a real QR code IMAGE
 * (via the `qrcode` package, pure JS, no native bindings — added this
 * pass) rendered from the exact TLV/base64 payload `ZatcaInvoiceService`
 * computed. The same Arabic-glyph limitation `PackingSlipService` already
 * documents applies here identically: `pdf-lib`'s bundled `StandardFonts`
 * are WinAnsi/Latin-only, so the Arabic label TEXT is real and complete but
 * will render as missing-glyph boxes without an embedded Arabic font
 * (docs/DEBT.md 5-D4, unchanged, not reintroduced by this pass).
 */
@Injectable()
export class ZatcaPdfService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly tenants: TenantRepository,
  ) {}

  async renderPdf(tenantId: string, invoiceId: string, locale: 'en' | 'ar'): Promise<Uint8Array> {
    const invoice = await this.invoices.findById(tenantId, invoiceId);
    if (invoice === null || invoice.zatca === null) {
      throw new NotFoundException({ message: 'ZATCA invoice not found', code: 'ZATCA_INVOICE_NOT_FOUND' });
    }
    const tenant = await this.tenants.findById(tenantId);
    const labels = LABELS[locale];

    const qrPng = await QRCode.toBuffer(invoice.zatca.qrTlvBase64, { type: 'png', margin: 1, width: 220 });

    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const qrImage = await doc.embedPng(qrPng);

    let y = 800;
    const draw = (text: string, size = 11, useBold = false): void => {
      page.drawText(text, { x: 40, y, size, font: useBold ? bold : font, color: rgb(0.05, 0.06, 0.08) });
      y -= size + 8;
    };

    draw(tenant?.name ?? 'OmniSell', 16, true);
    draw(labels.title, 14, true);
    draw(`${labels.invoiceNo}: ${invoice.invoiceNumber}`);
    draw(`${labels.vatNumber}: ${invoice.sellerVatNumber ?? ''}`);
    y -= 6;
    draw(`${labels.subtotal}: ${formatMoney(invoice.subtotalMinor.toString(), invoice.currency)}`);
    draw(`${labels.vat}: ${formatMoney(invoice.taxMinor.toString(), invoice.currency)}`);
    draw(`${labels.total}: ${formatMoney(invoice.totalMinor.toString(), invoice.currency)}`, 13, true);
    y -= 10;

    page.drawImage(qrImage, { x: 40, y: y - 220, width: 220, height: 220 });
    page.drawText(labels.qrHint, { x: 40, y: y - 236, size: 9, font, color: rgb(0.4, 0.44, 0.5) });

    return doc.save();
  }
}

function formatMoney(minor: string, currency: string): string {
  const value = (Number(BigInt(minor)) / 100).toFixed(2);
  return `${value} ${currency}`;
}
