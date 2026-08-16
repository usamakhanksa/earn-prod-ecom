import { Injectable } from '@nestjs/common';
import type { Invoice, InvoiceLine, Prisma, ZatcaInvoiceMeta } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export type InvoiceWithLines = Invoice & { lines: InvoiceLine[]; zatca: ZatcaInvoiceMeta | null };

/**
 * Invoices + KSA ZATCA Phase-2 metadata (Phase 6, tasks 6.7/6.8/6.9). Owns
 * `Invoice` + `InvoiceLine` + the one-to-one `ZatcaInvoiceMeta`.
 */
@Injectable()
export class InvoiceRepository extends TenantScopedRepository<Pick<PrismaService, 'invoice'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async createWithLines(
    invoice: Prisma.InvoiceUncheckedCreateInput,
    lines: Array<Omit<Prisma.InvoiceLineUncheckedCreateInput, 'invoiceId' | 'tenantId'>>,
  ): Promise<InvoiceWithLines> {
    return this.prisma.invoice.create({
      data: { ...invoice, lines: { create: lines.map((l) => ({ ...l, tenantId: invoice.tenantId })) } },
      include: { lines: true, zatca: true },
    });
  }

  async findById(tenantId: string, id: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findFirst({ where: { id, tenantId }, include: { lines: true, zatca: true } });
  }

  async findByOrderId(tenantId: string, orderId: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findFirst({ where: { tenantId, orderId }, include: { lines: true, zatca: true } });
  }

  async list(tenantId: string, cursor: string | undefined, limit: number): Promise<{ items: InvoiceWithLines[]; nextCursor: string | null }> {
    const items = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: { lines: true, zatca: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async nextInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { tenantId } });
    const year = new Date().getUTCFullYear();
    return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  async attachZatca(invoiceId: string, data: Omit<Prisma.ZatcaInvoiceMetaUncheckedCreateInput, 'invoiceId' | 'tenantId'> & { tenantId: string }): Promise<ZatcaInvoiceMeta> {
    return this.prisma.zatcaInvoiceMeta.create({ data: { ...data, invoiceId } });
  }

  async setPdfStorageKey(tenantId: string, invoiceId: string, pdfStorageKey: string): Promise<void> {
    await this.prisma.invoice.updateMany({ where: { id: invoiceId, tenantId }, data: { pdfStorageKey } });
  }
}
