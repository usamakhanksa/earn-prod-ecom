import { Injectable } from '@nestjs/common';
import type { BuyerMessageLog, BuyerMessageTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class BuyerMessageRepository extends TenantScopedRepository<Pick<PrismaService, 'buyerMessageTemplate'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async findTemplate(tenantId: string, type: string, locale: string): Promise<BuyerMessageTemplate | null> {
    return this.prisma.buyerMessageTemplate.findFirst({ where: { tenantId, type, locale } });
  }

  async listTemplates(tenantId: string): Promise<BuyerMessageTemplate[]> {
    return this.prisma.buyerMessageTemplate.findMany({ where: { tenantId }, orderBy: [{ type: 'asc' }, { locale: 'asc' }] });
  }

  async upsertTemplate(input: {
    tenantId: string;
    type: string;
    locale: string;
    subject: string;
    body: string;
  }): Promise<BuyerMessageTemplate> {
    return this.prisma.buyerMessageTemplate.upsert({
      where: { tenantId_type_locale: { tenantId: input.tenantId, type: input.type, locale: input.locale } },
      update: { subject: input.subject, body: input.body, isDefault: false },
      create: { ...input, isDefault: false },
    });
  }

  async logSend(input: Prisma.BuyerMessageLogUncheckedCreateInput): Promise<BuyerMessageLog> {
    return this.prisma.buyerMessageLog.create({ data: input });
  }

  async listLogsForOrder(tenantId: string, orderId: string): Promise<BuyerMessageLog[]> {
    return this.prisma.buyerMessageLog.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
  }
}
