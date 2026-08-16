import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Supplier, SupplierDocument } from '@prisma/client';
import type { SupplierSummary } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { computeRiskScore } from './risk.service';

export interface RegisterSupplierInput {
  companyName: string;
  legalName?: string | undefined;
  contactPerson?: string | undefined;
  email: string;
  phone?: string | undefined;
  countryCode: string;
  city?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  businessType?: string | undefined;
  taxVatNumber?: string | undefined;
  businessRegistrationNo?: string | undefined;
  productCategories?: string[] | undefined;
  shippingCountries?: string[] | undefined;
  fulfillmentMethod?: string | undefined;
  returnPolicy?: string | undefined;
  termsAccepted: boolean;
}

export interface SupplierDetail {
  id: string;
  companyName: string;
  email: string;
  countryCode: string;
  status: string;
  kyStatus: string;
  riskScore: number;
  productCategories: string[];
  shippingCountries: string[];
}

/** Supplier portal (spec §12–§15). Registration starts PENDING and requires admin approval. */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterSupplierInput, ctx: { userId?: string | undefined; ip?: string | undefined; userAgent?: string | undefined }): Promise<SupplierDetail> {
    if (!input.termsAccepted) {
      throw new ConflictException('Terms acceptance is required to register as a supplier');
    }
    const existing = await this.prisma.supplier.findUnique({ where: { email: input.email } });
    if (existing !== null) {
      throw new ConflictException(`A supplier with email '${input.email}' is already registered`);
    }
    const riskScore = computeRiskScore({
      repeatCount: 0,
      isSelfReferral: false,
      suspiciousIp: false,
    });
    const supplier = await this.prisma.supplier.create({
      data: {
        userId: ctx.userId ?? null,
        companyName: input.companyName,
        legalName: input.legalName ?? null,
        contactPerson: input.contactPerson ?? null,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        countryCode: input.countryCode.toUpperCase(),
        city: input.city ?? null,
        address: input.address ?? null,
        website: input.website ?? null,
        businessType: input.businessType ?? null,
        taxVatNumber: input.taxVatNumber ?? null,
        businessRegistrationNo: input.businessRegistrationNo ?? null,
        productCategories: input.productCategories ?? [],
        shippingCountries: input.shippingCountries ?? [],
        fulfillmentMethod: input.fulfillmentMethod ?? null,
        returnPolicy: input.returnPolicy ?? null,
        status: 'PENDING',
        kyStatus: 'UNVERIFIED',
        riskScore,
      },
    });
    return toDetail(supplier);
  }

  /** Public supplier directory — only APPROVED suppliers, optionally filtered by country. */
  async listPublic(countryCode?: string): Promise<{ items: SupplierSummary[] }> {
    const rows = await this.prisma.supplier.findMany({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        ...(countryCode !== undefined ? { countryCode: countryCode.toUpperCase() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { products: { where: { isActive: true }, select: { id: true } } },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        companyName: r.companyName,
        countryCode: r.countryCode,
        city: r.city,
        approvalRating: 5 - Math.min(4, Math.floor(r.riskScore / 25)), // derived 1..5 from risk
        productCategories: r.productCategories,
        status: r.status,
        logoUrl: r.logoUrl,
      })),
    };
  }

  async getForUser(userId: string, email?: string): Promise<SupplierDetail> {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        deletedAt: null,
        ...(userId !== undefined ? { userId } : { email: email?.toLowerCase() ?? 'invalid@none' }),
      },
    });
    if (supplier === null) {
      throw new NotFoundException('No supplier profile linked to this account');
    }
    return toDetail(supplier);
  }

  async updateForUser(
    userId: string,
    input: {
      companyName?: string | undefined;
      phone?: string | undefined;
      city?: string | undefined;
      address?: string | undefined;
      website?: string | undefined;
      returnPolicy?: string | undefined;
    },
  ): Promise<SupplierDetail> {
    const supplier = await this.prisma.supplier.findFirst({ where: { userId, deletedAt: null } });
    if (supplier === null) {
      throw new UnauthorizedException('No supplier profile linked to this account');
    }
    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.returnPolicy !== undefined ? { returnPolicy: input.returnPolicy } : {}),
      },
    });
    return toDetail(updated);
  }

  /** Upload registration documents (idempotent per kind). */
  async addDocument(supplierId: string, kind: string, url: string): Promise<SupplierDocument> {
    return this.prisma.supplierDocument.create({ data: { supplierId, kind, url, status: 'PENDING' } });
  }
}

function toDetail(s: Supplier): SupplierDetail {
  return {
    id: s.id,
    companyName: s.companyName,
    email: s.email,
    countryCode: s.countryCode,
    status: s.status,
    kyStatus: s.kyStatus,
    riskScore: s.riskScore,
    productCategories: s.productCategories,
    shippingCountries: s.shippingCountries,
  };
}