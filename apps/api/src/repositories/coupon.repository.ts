import { Injectable } from '@nestjs/common';
import type { Coupon, CouponRedemption, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CouponRepository extends TenantScopedRepository<Pick<PrismaService, 'coupon'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: Prisma.CouponUncheckedCreateInput): Promise<Coupon> {
    return this.prisma.coupon.create({ data: input });
  }

  async findById(tenantId: string, id: string): Promise<Coupon | null> {
    return this.prisma.coupon.findFirst({ where: { id, tenantId } });
  }

  async findByCode(tenantId: string, code: string, client: Client = this.prisma): Promise<Coupon | null> {
    return client.coupon.findFirst({ where: { tenantId, code } });
  }

  async list(tenantId: string): Promise<Coupon[]> {
    return this.prisma.coupon.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async update(tenantId: string, id: string, data: Prisma.CouponUpdateInput): Promise<Coupon | null> {
    const existing = await this.findById(tenantId, id);
    if (existing === null) {
      return null;
    }
    return this.prisma.coupon.update({ where: { id }, data });
  }

  async incrementUsage(id: string, client: Client = this.prisma): Promise<Coupon> {
    return client.coupon.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  }

  async countRedemptionsByBuyer(tenantId: string, couponId: string, buyerEmail: string, client: Client = this.prisma): Promise<number> {
    return client.couponRedemption.count({ where: { tenantId, couponId, buyerEmail } });
  }

  async createRedemption(input: Prisma.CouponRedemptionUncheckedCreateInput, client: Client = this.prisma): Promise<CouponRedemption> {
    return client.couponRedemption.create({ data: input });
  }

  async findRedemptionByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<CouponRedemption | null> {
    return this.prisma.couponRedemption.findFirst({ where: { tenantId, idempotencyKey } });
  }

  async listRedemptions(tenantId: string, couponId: string): Promise<CouponRedemption[]> {
    return this.prisma.couponRedemption.findMany({ where: { tenantId, couponId }, orderBy: { createdAt: 'desc' } });
  }
}
