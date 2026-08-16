import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CountriesService } from './countries.service';

function countryCodeFromRequest(req: Request): string | undefined {
  const header = req.headers['x-country-code'];
  if (typeof header === 'string' && header.length === 2) return header.toUpperCase();
  const cookie = req.headers.cookie?.match(/omnisell_country=([A-Za-z]{2})/);
  return cookie?.[1]?.toUpperCase();
}

@Controller('marketplace/countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  list() {
    return this.countries.list();
  }

  @Get('detect')
  detect(@Req() req: Request) {
    return this.countries.detect({
      selectedCountryCode: countryCodeFromRequest(req),
      acceptLanguage: req.headers['accept-language'],
      ip: req.ip,
    });
  }

  @Get(':code')
  getByCode(@Param('code') code: string) {
    return this.countries.getByCode(code);
  }
}