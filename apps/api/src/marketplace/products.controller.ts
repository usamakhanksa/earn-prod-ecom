import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { MarketplaceProductsService } from './products.service';

const listQuery = z.object({
  country: z.string().length(2).optional(),
  category: z.string().optional(),
  supplier: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
});

@Controller('marketplace/products')
export class MarketplaceProductsController {
  constructor(private readonly products: MarketplaceProductsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.products.list(listQuery.parse(query));
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.products.getBySlug(slug);
  }
}