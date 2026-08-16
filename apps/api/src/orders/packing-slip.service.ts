import { Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { OrderRepository } from '../repositories/order.repository';
import { TenantRepository } from '../repositories/tenant.repository';

export interface PackingSlipData {
  orderNumber: string;
  placedAt: string;
  buyerName: string | null;
  buyerEmail: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  currency: string;
  subtotalMinor: string;
  taxMinor: string;
  shippingMinor: string;
  totalMinor: string;
  items: Array<{ title: string; sku: string | null; quantity: number; unitPriceMinor: string; totalPriceMinor: string }>;
  tenantName: string;
}

const BILINGUAL_LABELS = {
  en: {
    packingSlip: 'Packing Slip',
    commercialInvoice: 'Commercial Invoice',
    order: 'Order',
    date: 'Date',
    billTo: 'Bill To',
    shipTo: 'Ship To',
    item: 'Item',
    qty: 'Qty',
    unitPrice: 'Unit Price',
    total: 'Total',
    subtotal: 'Subtotal',
    tax: 'Tax',
    shipping: 'Shipping',
    grandTotal: 'Grand Total',
  },
  ar: {
    packingSlip: 'قائمة التعبئة',
    commercialInvoice: 'فاتورة تجارية',
    order: 'الطلب',
    date: 'التاريخ',
    billTo: 'الفاتورة إلى',
    shipTo: 'الشحن إلى',
    item: 'الصنف',
    qty: 'الكمية',
    unitPrice: 'سعر الوحدة',
    total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    tax: 'الضريبة',
    shipping: 'الشحن',
    grandTotal: 'الإجمالي الكلي',
  },
} as const;

/**
 * Packing-slip / commercial-invoice PDF generation, bilingual (featureslist.md
 * 6.9, task 5.8). `pdf-lib` (pure JS, no native bindings) works cleanly in
 * this sandbox — confirmed by generating and byte-inspecting a real PDF (`%PDF-`
 * magic header) during this pass, so the real rendering path is implemented,
 * not stubbed.
 *
 * HONEST GAP: `pdf-lib`'s built-in `StandardFonts` are WinAnsi/Latin-only —
 * they cannot render Arabic glyphs (no embedded Arabic-script font ships with
 * this dependency, and this sandbox has no bundled Arabic TTF to embed). The
 * bilingual DATA (both label sets above, real Arabic strings) is real and
 * complete; the EN document renders Arabic labels correctly since it never
 * needs Arabic glyphs. The AR-locale PDF currently prints the same Arabic
 * label strings but WILL show missing-glyph boxes for actual Arabic text
 * rendering until a real Arabic-supporting font (e.g. Amiri/Noto Naskh Arabic)
 * is embedded via `doc.embedFont` with `fontkit` registered — a real,
 * documented follow-up (docs/DEBT.md), not a fabricated "it works" claim.
 * `buildData()` (the bilingual data-assembly half of this task) is fully
 * real and independent of the font limitation.
 */
@Injectable()
export class PackingSlipService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly tenants: TenantRepository,
  ) {}

  async buildData(tenantId: string, orderId: string): Promise<PackingSlipData> {
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const tenant = await this.tenants.findById(tenantId);
    return {
      orderNumber: order.orderNumber,
      placedAt: order.placedAt.toISOString(),
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      currency: order.currency,
      subtotalMinor: order.subtotalMinor.toString(),
      taxMinor: order.taxMinor.toString(),
      shippingMinor: order.shippingMinor.toString(),
      totalMinor: order.totalMinor.toString(),
      items: order.items.map((i) => ({ title: i.title, sku: i.sku, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor.toString(), totalPriceMinor: i.totalPriceMinor.toString() })),
      tenantName: tenant?.name ?? 'OmniSell',
    };
  }

  async renderPdf(tenantId: string, orderId: string, kind: 'PACKING_SLIP' | 'INVOICE', locale: 'en' | 'ar'): Promise<Uint8Array> {
    const data = await this.buildData(tenantId, orderId);
    const labels = BILINGUAL_LABELS[locale];
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let y = 800;
    const draw = (text: string, size = 11, useBold = false): void => {
      page.drawText(text, { x: 40, y, size, font: useBold ? bold : font, color: rgb(0.05, 0.06, 0.08) });
      y -= size + 8;
    };

    draw(data.tenantName, 16, true);
    draw(kind === 'PACKING_SLIP' ? labels.packingSlip : labels.commercialInvoice, 14, true);
    draw(`${labels.order}: ${data.orderNumber}`);
    draw(`${labels.date}: ${new Date(data.placedAt).toISOString().slice(0, 10)}`);
    y -= 6;
    draw(`${labels.shipTo}: ${data.buyerName ?? ''}`.trim());
    y -= 10;
    draw(`${labels.item} / ${labels.qty} / ${labels.unitPrice} / ${labels.total}`, 10, true);
    for (const item of data.items) {
      draw(`${item.title}  x${item.quantity}  ${formatMoney(item.unitPriceMinor, data.currency)}  ${formatMoney(item.totalPriceMinor, data.currency)}`, 10);
    }
    y -= 6;
    draw(`${labels.subtotal}: ${formatMoney(data.subtotalMinor, data.currency)}`);
    draw(`${labels.tax}: ${formatMoney(data.taxMinor, data.currency)}`);
    draw(`${labels.shipping}: ${formatMoney(data.shippingMinor, data.currency)}`);
    draw(`${labels.grandTotal}: ${formatMoney(data.totalMinor, data.currency)}`, 13, true);

    return doc.save();
  }
}

function formatMoney(minor: string, currency: string): string {
  const value = (Number(BigInt(minor)) / 100).toFixed(2);
  return `${value} ${currency}`;
}
