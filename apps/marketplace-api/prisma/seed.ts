/**
 * Real-database seed script for Category/Product/ProductCountry/
 * ProductVariant/Inventory + CountryConfig, using the exact same seed data
 * MockProductRepository/MockCountryConfigRepository build their in-memory
 * catalog from (single source of truth — no drift between what MOCK_MODE
 * serves and what a real database would seed).
 *
 * NEVER RUN against a live database in this sandbox (no Docker/Postgres
 * here — see docs/marketplace/DEBT.md). Included so the real-DB path is
 * complete code, not just an interface with no seeding story, and so it's
 * ready to run the moment MARKETPLACE_DATABASE_URL points at real Postgres:
 *
 *   MARKETPLACE_DATABASE_URL=postgresql://... pnpm --filter @marketplace/api db:seed
 */
import { PrismaClient } from '../src/generated/prisma-client/index.js';
import { COUNTRY_CONFIG_SEED } from '@marketplace/country';
import { CATEGORY_SEED, PRODUCT_SEED } from '../src/repositories/seed/catalog-seed-data.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const country of COUNTRY_CONFIG_SEED) {
    await prisma.countryConfig.upsert({
      where: { code: country.code },
      create: {
        code: country.code,
        name: country.name,
        nativeName: country.nativeName,
        currency: country.currency,
        currencySymbol: country.currencySymbol,
        defaultLanguage: country.defaultLanguage,
        timezone: country.timezone,
        isActive: country.isActive,
        supportedPayments: country.supportedPayments,
        supportedMarketplaces: country.supportedMarketplaces,
        shippingProviders: country.shippingProviders,
        restrictedCategorySlugs: country.restrictedCategorySlugs,
      },
      update: {
        name: country.name,
        nativeName: country.nativeName,
        currency: country.currency,
        currencySymbol: country.currencySymbol,
        defaultLanguage: country.defaultLanguage,
        timezone: country.timezone,
        isActive: country.isActive,
        supportedPayments: country.supportedPayments,
        supportedMarketplaces: country.supportedMarketplaces,
        shippingProviders: country.shippingProviders,
        restrictedCategorySlugs: country.restrictedCategorySlugs,
      },
    });
  }

  for (const category of CATEGORY_SEED) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        sortOrder: category.sortOrder,
      },
      update: {
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        sortOrder: category.sortOrder,
      },
    });
  }

  for (const product of PRODUCT_SEED) {
    const category = await prisma.category.findUnique({ where: { slug: product.categorySlug } });

    const created = await prisma.product.upsert({
      where: { sku: product.sku },
      create: {
        sku: product.sku,
        slug: product.slug,
        title: product.title,
        description: product.description,
        basePrice: product.basePrice,
        baseCurrency: product.baseCurrency ?? 'USD',
        compareAtPrice: product.compareAtPrice ?? null,
        rating: product.rating ?? null,
        ratingCount: product.ratingCount ?? 0,
        defaultShippingDays: product.defaultShippingDays ?? null,
        source: 'internal',
        categoryId: category?.id ?? null,
        images: {
          create: product.images.map((img, index) => ({
            url: img.url,
            altText: img.altText ?? product.title,
            sortOrder: index,
          })),
        },
        variants: {
          create: (product.variants ?? []).map((v) => ({
            sku: v.sku,
            name: v.name,
            price: v.price,
            currency: v.currency ?? product.baseCurrency ?? 'USD',
            stock: v.stock,
            attributes: v.attributes ?? undefined,
          })),
        },
        countryAvailability: {
          create: product.countryAvailability.map((row) => ({
            countryCode: row.countryCode.toUpperCase(),
            isAvailable: row.isAvailable ?? true,
            price: row.price ?? null,
            currency: row.currency ?? null,
          })),
        },
      },
      update: {
        title: product.title,
        description: product.description,
        basePrice: product.basePrice,
        compareAtPrice: product.compareAtPrice ?? null,
        rating: product.rating ?? null,
        ratingCount: product.ratingCount ?? 0,
        defaultShippingDays: product.defaultShippingDays ?? null,
        categoryId: category?.id ?? null,
      },
    });

    // eslint-disable-next-line no-console
    console.warn(`Seeded product ${created.slug}`);
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
