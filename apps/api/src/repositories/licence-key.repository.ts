import { Injectable } from '@nestjs/common';
import type { LicenceKey, LicenceKeyActivation, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class LicenceKeyRepository extends TenantScopedRepository<Pick<PrismaService, 'licenceKey'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.LicenceKeyUncheckedCreateInput): Promise<LicenceKey> {
    return this.prisma.licenceKey.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<LicenceKey | null> {
    return this.prisma.licenceKey.findFirst({ where: { id, tenantId } });
  }

  async findByValue(tenantId: string, keyValue: string): Promise<LicenceKey | null> {
    return this.prisma.licenceKey.findFirst({ where: { tenantId, keyValue } });
  }

  async listForDigitalProduct(tenantId: string, digitalProductId: string): Promise<LicenceKey[]> {
    return this.prisma.licenceKey.findMany({ where: { tenantId, digitalProductId }, orderBy: { createdAt: 'desc' } });
  }

  async listForEntitlement(tenantId: string, entitlementId: string): Promise<LicenceKey[]> {
    return this.prisma.licenceKey.findMany({ where: { tenantId, entitlementId } });
  }

  async update(tenantId: string, id: string, data: Prisma.LicenceKeyUpdateInput): Promise<LicenceKey | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.licenceKey.update({ where: { id }, data });
  }

  async createActivation(input: Prisma.LicenceKeyActivationUncheckedCreateInput): Promise<LicenceKeyActivation> {
    return this.prisma.licenceKeyActivation.create({ data: input });
  }

  async findActivation(licenceKeyId: string, deviceId: string): Promise<LicenceKeyActivation | null> {
    return this.prisma.licenceKeyActivation.findUnique({ where: { licenceKeyId_deviceId: { licenceKeyId, deviceId } } });
  }

  async listActivations(tenantId: string, licenceKeyId: string): Promise<LicenceKeyActivation[]> {
    return this.prisma.licenceKeyActivation.findMany({ where: { tenantId, licenceKeyId } });
  }

  async deactivate(tenantId: string, activationId: string): Promise<LicenceKeyActivation | null> {
    const existing = await this.prisma.licenceKeyActivation.findFirst({ where: { id: activationId, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.licenceKeyActivation.update({ where: { id: activationId }, data: { deactivatedAt: new Date() } });
  }
}
