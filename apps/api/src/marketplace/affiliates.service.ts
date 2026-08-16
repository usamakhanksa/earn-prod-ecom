import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AffiliateLink } from '@prisma/client';
import type { AffiliateSummary, CommissionSummary } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';
import { computeRiskScore, deviceFromUserAgent, hashIp } from './risk.service';
import {
  computeCommissionAmount,
  resolveCommission,
  type CommissionContext,
} from './commission.engine';

export interface RegisterAffiliateInput {
  fullName: string;
  email: string;
  phone?: string | undefined;
  countryCode: string;
  website?: string | undefined;
  socialProfiles?: string[] | undefined;
  trafficSource?: string | undefined;
  niche?: string | undefined;
  preferredCategories?: string[] | undefined;
  payoutMethod?: string | undefined;
  taxInformation?: string | undefined;
  termsAccepted: boolean;
}

export interface CreateLinkInput {
  productId?: string | undefined;
  productSlug?: string | undefined;
  type?: 'PRODUCT' | 'CATEGORY' | 'LANDING' | 'CAMPAIGN' | undefined;
  title?: string | undefined;
  campaignId?: string | undefined;
  subId?: string | undefined;
  trafficSource?: string | undefined;
  countryCode?: string | undefined;
}

export interface TrackClickInput {
  affiliateCode: string;
  linkId?: string | undefined;
  productSlug?: string | undefined;
  visitorId?: string | undefined;
  countryCode?: string | undefined;
}

export interface AffiliateEarnings {
  affiliateId: string;
  code: string;
  pendingMinor: string;
  approvedMinor: string;
  paidMinor: string;
  totalMinor: string;
  currency: string;
  commissions: CommissionSummary[];
}

/** Affiliate portal (spec §16–§18) + server-side attribution (§55). */
@Injectable()
export class AffiliatesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterAffiliateInput): Promise<AffiliateSummary> {
    if (!input.termsAccepted) {
      throw new ConflictException('Terms acceptance is required to join the affiliate program');
    }
    const existing = await this.prisma.affiliate.findUnique({ where: { email: input.email } });
    if (existing !== null) {
      throw new ConflictException(`An affiliate with email '${input.email}' already exists`);
    }
    const code = this.generateCode(input.fullName);
    const affiliate = await this.prisma.affiliate.create({
      data: {
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        countryCode: input.countryCode.toUpperCase(),
        website: input.website ?? null,
        socialProfiles: input.socialProfiles ?? [],
        trafficSource: input.trafficSource ?? null,
        niche: input.niche ?? null,
        preferredCategories: input.preferredCategories ?? [],
        payoutMethod: input.payoutMethod ?? null,
        taxInformation: input.taxInformation ?? null,
        code,
        status: 'PENDING',
      },
    });
    return { id: affiliate.id, fullName: affiliate.fullName, code: affiliate.code, countryCode: affiliate.countryCode, status: affiliate.status, riskScore: affiliate.riskScore };
  }

  async getForUser(userId: string): Promise<AffiliateSummary> {
    const aff = await this.prisma.affiliate.findFirst({ where: { userId, deletedAt: null } });
    if (aff === null) {
      throw new NotFoundException('No affiliate profile linked to this account');
    }
    return { id: aff.id, fullName: aff.fullName, code: aff.code, countryCode: aff.countryCode, status: aff.status, riskScore: aff.riskScore };
  }

  /** Link builder (spec §18) — generates the tracking URL and stores it. */
  async createLink(userId: string, input: CreateLinkInput): Promise<{ link: AffiliateLink; url: string }> {
    const affiliate = await this.prisma.affiliate.findFirst({ where: { userId, status: 'APPROVED', deletedAt: null } });
    if (affiliate === null) {
      throw new UnauthorizedException('Only approved affiliates can generate links');
    }

    let productId = input.productId;
    if (productId === undefined && input.productSlug !== undefined) {
      const product = await this.prisma.marketplaceProduct.findUnique({ where: { slug: input.productSlug } });
      if (product === null) {
        throw new NotFoundException('Product not found');
      }
      productId = product.id;
    }

    const type = input.type ?? (productId !== undefined ? 'PRODUCT' : 'LANDING');
    const params = new URLSearchParams({ ref: affiliate.code });
    if (input.campaignId !== undefined) params.set('cid', input.campaignId);
    if (input.subId !== undefined) params.set('sub', input.subId);
    if (input.trafficSource !== undefined) params.set('src', input.trafficSource);
    const path = type === 'PRODUCT' ? `/product/${input.productSlug ?? affiliate.code}` : '/marketplace';

    const url = `${env.APP_URL.replace(/\/$/, '')}${path}?${params.toString()}`;
    const link = await this.prisma.affiliateLink.create({
      data: {
        affiliateId: affiliate.id,
        productId: productId ?? null,
        type,
        title: input.title ?? null,
        url,
        campaignId: input.campaignId ?? null,
        subId: input.subId ?? null,
        trafficSource: input.trafficSource ?? null,
        countryCode: input.countryCode?.toUpperCase() ?? null,
      },
    });
    return { link, url };
  }

  async listLinks(userId: string): Promise<AffiliateLink[]> {
    const affiliate = await this.prisma.affiliate.findFirst({ where: { userId, deletedAt: null } });
    if (affiliate === null) return [];
    return this.prisma.affiliateLink.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: 'desc' } });
  }
  /**
   * Server-side click attribution (spec §55). The client NEVER sets the
   * commission — it only reports a click; the server records it, increments the
   * link counter and flags fraud. Attribution windows/commission are resolved
   * at conversion time (when an order posts `recordConversion`).
   */
  async trackClick(
    input: TrackClickInput & { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<{ ok: true; clickId: string; isFraud: boolean }> {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code: input.affiliateCode } });
    if (affiliate === null) {
      // Unknown code — never throw (costs the referrer nothing), just record nothing.
      return { ok: true, clickId: '', isFraud: false };
    }

    let productId: string | undefined;
    if (input.productSlug !== undefined) {
      const product = await this.prisma.marketplaceProduct.findUnique({ where: { slug: input.productSlug } });
      productId = product?.id;
    }

    const repeatToday = input.visitorId !== undefined
      ? await this.prisma.affiliateClick.count({
          where: {
            affiliateId: affiliate.id,
            visitorId: input.visitorId,
            clientTs: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        })
      : 0;

    const riskScore = computeRiskScore({ repeatCount: repeatToday, isSelfReferral: false });
    const isFraud = riskScore >= 55;

    const click = await this.prisma.affiliateClick.create({
      data: {
        affiliateId: affiliate.id,
        linkId: input.linkId ?? null,
        productId: productId ?? null,
        visitorId: input.visitorId ?? null,
        countryCode: input.countryCode?.toUpperCase() ?? null,
        device: deviceFromUserAgent(input.userAgent),
        ipHash: input.ip !== undefined ? hashIp(input.ip) : null,
        isFraud,
        riskScore,
      },
    });

    if (input.linkId !== undefined) {
      await this.prisma.affiliateLink.update({
        where: { id: input.linkId },
        data: { clicks: { increment: 1 } },
      });
    }

    return { ok: true, clickId: click.id, isFraud };
  }

  /**
   * Called at order/conversion time (order service posts here). Resolves the
   * commission via the engine and persists a PENDING commission row — the
   * amount is computed server-side only, never sent from the client.
   */
  async recordConversion(
    affiliateCode: string | undefined,
    orderRef: string,
    orderTotalMinor: bigint,
    currency: string,
    ctx: CommissionContext,
    attributionDays = 30,
  ): Promise<void> {
    if (affiliateCode === undefined) return;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code: affiliateCode } });
    if (affiliate === null || affiliate.status !== 'APPROVED') return;

    const rules = await this.prisma.commissionRule.findMany({ where: { isActive: true } });
    const resolved = resolveCommission(rules, ctx);
    const amountMinor = computeCommissionAmount(orderTotalMinor, resolved);

    await this.prisma.affiliateCommission.create({
      data: {
        affiliateId: affiliate.id,
        orderRef,
        orderTotalMinor,
        amountMinor,
        currency,
        rateType: resolved.rateType,
        rateValue: resolved.rateValue,
        status: 'PENDING',
        windowDays: attributionDays,
      },
    });
  }

  /** Affiliate earnings dashboard (§17) with commission statuses. */
  async earnings(userId: string): Promise<AffiliateEarnings> {
    const affiliate = await this.prisma.affiliate.findFirst({ where: { userId, deletedAt: null } });
    if (affiliate === null) {
      throw new NotFoundException('No affiliate profile linked to this account');
    }
    const commissions = await this.prisma.affiliateCommission.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const currency = commissions[0]?.currency ?? 'USD';
    const sum = (statuses: string[]) =>
      commissions.filter((c) => statuses.includes(c.status)).reduce((acc, c) => acc + c.amountMinor, 0n);
    const pending = sum(['PENDING']);
    const approved = sum(['APPROVED']);
    const paid = sum(['PAID']);
    return {
      affiliateId: affiliate.id,
      code: affiliate.code,
      pendingMinor: pending.toString(),
      approvedMinor: approved.toString(),
      paidMinor: paid.toString(),
      totalMinor: (pending + approved + paid).toString(),
      currency,
      commissions: commissions.map((c) => ({
        amountMinor: c.amountMinor.toString(),
        currency: c.currency,
        rateType: c.rateType,
        rateValue: c.rateValue.toString(),
        status: c.status,
      })),
    };
  }

  private generateCode(fullName: string): string {
    const initials = fullName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'AF';
    const n = Math.floor(100000 + Math.random() * 900000);
    return `${initials}${n}`;
  }
}