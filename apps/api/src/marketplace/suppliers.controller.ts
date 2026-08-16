import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { SuppliersService, type RegisterSupplierInput } from './suppliers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

const registerSchema = z.object({
  companyName: z.string().min(2),
  legalName: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  countryCode: z.string().length(2),
  city: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url().optional(),
  businessType: z.string().optional(),
  taxVatNumber: z.string().optional(),
  businessRegistrationNo: z.string().optional(),
  productCategories: z.array(z.string()).optional(),
  shippingCountries: z.array(z.string().length(2)).optional(),
  fulfillmentMethod: z.string().optional(),
  returnPolicy: z.string().optional(),
  termsAccepted: z.boolean(),
});

const updateSchema = z.object({
  companyName: z.string().min(2).optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url().optional(),
  returnPolicy: z.string().optional(),
});

@Controller('marketplace/suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post('register')
  @SkipAuditLog() // SuppliersService writes precise business events on approvals
  register(@Body() body: unknown, @Req() request: Request) {
    const input = registerSchema.parse(body) as RegisterSupplierInput;
    return this.suppliers.register(input, { ip: request.ip, userAgent: request.headers['user-agent'] });
  }

  @Get()
  list(@Query('country') country?: string) {
    return this.suppliers.listPublic(country);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUserId() userId: string) {
    return this.suppliers.getForUser(userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = updateSchema.parse(body);
    return this.suppliers.updateForUser(userId, input);
  }
}