import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AffiliatesService } from './affiliates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  countryCode: z.string().length(2),
  website: z.string().url().optional(),
  socialProfiles: z.array(z.string()).optional(),
  trafficSource: z.string().optional(),
  niche: z.string().optional(),
  preferredCategories: z.array(z.string()).optional(),
  payoutMethod: z.string().optional(),
  taxInformation: z.string().optional(),
  termsAccepted: z.boolean(),
});

const linkSchema = z.object({
  productId: z.string().optional(),
  productSlug: z.string().optional(),
  type: z.enum(['PRODUCT', 'CATEGORY', 'LANDING', 'CAMPAIGN']).optional(),
  title: z.string().optional(),
  campaignId: z.string().optional(),
  subId: z.string().optional(),
  trafficSource: z.string().optional(),
  countryCode: z.string().length(2).optional(),
});

const clickSchema = z.object({
  affiliateCode: z.string().min(3),
  linkId: z.string().optional(),
  productSlug: z.string().optional(),
  visitorId: z.string().optional(),
  countryCode: z.string().length(2).optional(),
});

@Controller('marketplace/affiliates')
export class AffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Post('register')
  @SkipAuditLog()
  register(@Body() body: unknown) {
    return this.affiliates.register(registerSchema.parse(body));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUserId() userId: string) {
    return this.affiliates.getForUser(userId);
  }

  @Post('links')
  @UseGuards(JwtAuthGuard)
  createLink(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.affiliates.createLink(userId, linkSchema.parse(body));
  }

  @Get('links')
  @UseGuards(JwtAuthGuard)
  listLinks(@CurrentUserId() userId: string) {
    return this.affiliates.listLinks(userId);
  }

  @Post('clicks/track')
  @SkipAuditLog() // high-volume public endpoint — per-click audit rows would flood the log
  trackClick(@Body() body: unknown, @Req() request: Request) {
    return this.affiliates.trackClick({
      ...clickSchema.parse(body),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Get('earnings')
  @UseGuards(JwtAuthGuard)
  earnings(@CurrentUserId() userId: string) {
    return this.affiliates.earnings(userId);
  }
}