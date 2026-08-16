import { Module } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { CountriesController } from './countries.controller';
import { CountryDetectionService } from './country-detection.service';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { AffiliatesService } from './affiliates.service';
import { AffiliatesController } from './affiliates.controller';
import { MarketplaceProductsService } from './products.service';
import { MarketplaceProductsController } from './products.controller';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit/audit-log.module';

/**
 * Global Marketplace (ecom-front.txt) — country-aware storefront, supplier and
 * affiliate programs, tasks/offers, commission engine and payouts. PrismaModule
 * is @Global() so PrismaService is available without an explicit import.
 */
@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [
    CountriesController,
    MarketplaceProductsController,
    SuppliersController,
    AffiliatesController,
    TasksController,
    PayoutsController,
  ],
  providers: [
    CountriesService,
    CountryDetectionService,
    SuppliersService,
    AffiliatesService,
    MarketplaceProductsService,
    TasksService,
    PayoutsService,
  ],
  exports: [CountriesService, SuppliersService, AffiliatesService, MarketplaceProductsService, TasksService, PayoutsService],
})
export class MarketplaceModule {}