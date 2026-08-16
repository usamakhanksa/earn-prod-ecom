import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { MARKETPLACE_COUNTRIES } from '@omnisell/shared';

const DEMO_PASSWORD = 'Demo!2345';

/**
 * Marketplace demo data (ecom-front.txt §66/§67). Idempotent — safe to re-run.
 * Seeds: country configs, marketplace categories, commission rules, one
 * APPROVED supplier + a storefront catalog, one APPROVED affiliate, and a set
 * of MOCK tasks/offers. In MOCK_MODE the storefront is fully browsable
 * end-to-end with this data.
 */
export async function seedMarketplace(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hash(DEMO_PASSWORD);

  // --- Countries (spec §7 — admin-editable CountryConfig table) -------------
  for (const c of MARKETPLACE_COUNTRIES) {
    await prisma.countryConfig.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        currency: c.currency,
        currencySymbol: c.currencySymbol,
        defaultLanguage: c.defaultLanguage,
        timezone: c.timezone,
        isActive: true,
        supportedPayments: c.supportedPayments,
        supportedMarketplaces: c.supportedMarketplaces,
        shippingProviders: c.shippingProviders,
      },
      create: {
        code: c.code,
        name: c.name,
        currency: c.currency,
        currencySymbol: c.currencySymbol,
        defaultLanguage: c.defaultLanguage,
        timezone: c.timezone,
        isActive: true,
        supportedPayments: c.supportedPayments,
        supportedMarketplaces: c.supportedMarketplaces,
        shippingProviders: c.shippingProviders,
      },
    });
  }

  // --- Marketplace categories (spec §9) --------------------------------------
  const categories = [
    { slug: 'electronics', name: 'Electronics', description: 'Phones, laptops, wearables and accessories' },
    { slug: 'fashion', name: 'Fashion', description: 'Clothing, shoes and accessories' },
    { slug: 'beauty', name: 'Beauty', description: 'Skincare, haircare and cosmetics' },
    { slug: 'home-garden', name: 'Home & Garden', description: 'Furniture, decor and outdoor living' },
    { slug: 'sports', name: 'Sports & Fitness', description: 'Sports gear, gym equipment and activewear' },
    { slug: 'automotive', name: 'Automotive', description: 'Car parts and accessories' },
    { slug: 'health', name: 'Health', description: 'Wellness and personal care' },
    { slug: 'kids', name: 'Kids', description: 'Toys, clothing and baby gear' },
    { slug: 'office', name: 'Office', description: 'Office supplies and furniture' },
    { slug: 'digital', name: 'Digital Products', description: 'Ebooks, software, templates and courses' },
  ];
  for (const category of categories) {
    await prisma.marketplaceCategory.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, isActive: true },
      create: { slug: category.slug, name: category.name, description: category.description, isActive: true },
    });
  }

  // --- Commission rules (spec §19/§56 — stored, never hard-coded) ------------
  const rules: Array<{ scope: string; scopeKey: string | null; rateType: string; rateValue: number }> = [
    { scope: 'GLOBAL', scopeKey: null, rateType: 'PERCENT', rateValue: 8 },
    { scope: 'CATEGORY', scopeKey: 'electronics', rateType: 'PERCENT', rateValue: 5 },
    { scope: 'CATEGORY', scopeKey: 'fashion', rateType: 'PERCENT', rateValue: 10 },
    { scope: 'CATEGORY', scopeKey: 'digital', rateType: 'PERCENT', rateValue: 20 },
    { scope: 'COUNTRY', scopeKey: 'SA', rateType: 'PERCENT', rateValue: 10 },
    { scope: 'COUNTRY', scopeKey: 'US', rateType: 'PERCENT', rateValue: 7 },
  ];
  for (const rule of rules) {
    // Prisma's generated compound-unique selector for `@@unique([scope, scopeKey])`
    // types `scopeKey` as non-nullable `string` even though the column itself is
    // nullable (a Prisma client-typing limitation, not a schema issue) — `upsert`'s
    // `where` cannot take the GLOBAL rows' real `null` scopeKey. Manual find/update-
    // or-create keeps this idempotent (this function's own doc comment) without
    // fighting that type.
    const existing = await prisma.commissionRule.findFirst({ where: { scope: rule.scope, scopeKey: rule.scopeKey } });
    if (existing !== null) {
      await prisma.commissionRule.update({
        where: { id: existing.id },
        data: { rateType: rule.rateType, rateValue: rule.rateValue, isActive: true },
      });
    } else {
      await prisma.commissionRule.create({
        data: { scope: rule.scope, scopeKey: rule.scopeKey, rateType: rule.rateType, rateValue: rule.rateValue, isActive: true },
      });
    }
  }

  // --- Demo supplier (APPROVED so it appears in the storefront) --------------
  await ensureUser(prisma, 'supplier@demo.test', passwordHash, 'Demo Supplier');
  const supplierUser = await prisma.user.findUnique({ where: { email: 'supplier@demo.test' } });
  const supplier = await prisma.supplier.upsert({
    where: { email: 'supplier@demo.test' },
    update: {},
    create: {
      userId: supplierUser?.id ?? null,
      companyName: 'Al-Noor Trading',
      legalName: 'Al-Noor Trading LLC',
      contactPerson: 'Khalid Al-Noor',
      email: 'supplier@demo.test',
      phone: '+966500000000',
      countryCode: 'SA',
      city: 'Riyadh',
      address: 'Olaya Street, Riyadh',
      website: 'https://alnoordemo.example',
      businessType: 'LLC',
      taxVatNumber: '310000000000003',
      businessRegistrationNo: '1010123456',
      productCategories: ['electronics', 'fashion'],
      shippingCountries: ['SA', 'US', 'GB', 'AE'],
      fulfillmentMethod: 'DROPSHIPPING',
      returnPolicy: '14-day returns on unused items',
      status: 'APPROVED',
      kyStatus: 'VERIFIED',
      riskScore: 0,
      approvedAt: new Date(),
    },
  });

  const electronicsId = (await prisma.marketplaceCategory.findUnique({ where: { slug: 'electronics' } }))!.id;
  const fashionId = (await prisma.marketplaceCategory.findUnique({ where: { slug: 'fashion' } }))!.id;
  // --- Storefront catalog (spec §45 UnifiedProduct shape) --------------------
  const products = [
    {
      slug: 'aurora-smart-watch-pro',
      name: 'Aurora Smart Watch Pro',
      description: 'GPS + heart-rate smart watch with 10-day battery, AMOLED display and water resistance.',
      categoryId: electronicsId,
      priceMinor: 34999n,
      originalPriceMinor: 44999n,
      brand: 'Aurora',
      rating: 4.7,
      ratingCount: 128,
      inventory: 240,
      estimatedDeliveryDays: '5–10 days',
      affiliateCommissionPct: 6,
    },
    {
      slug: 'ultra-quiet-headphones',
      name: 'Ultra Quiet ANC Headphones',
      description: 'Active noise cancelling over-ear headphones with 40h playback and multipoint pairing.',
      categoryId: electronicsId,
      priceMinor: 18999n,
      originalPriceMinor: 24999n,
      brand: 'SoundPeak',
      rating: 4.5,
      ratingCount: 87,
      inventory: 500,
      estimatedDeliveryDays: '3–7 days',
      affiliateCommissionPct: 7,
    },
    {
      slug: 'kinetic-running-shoes',
      name: 'Kinetic Running Shoes',
      description: 'Lightweight breathable running shoes with responsive cushioning. Unisex sizes 36–46.',
      categoryId: fashionId,
      priceMinor: 12999n,
      originalPriceMinor: 16999n,
      brand: 'Stride',
      rating: 4.4,
      ratingCount: 215,
      inventory: 800,
      estimatedDeliveryDays: '4–9 days',
      affiliateCommissionPct: 10,
    },
    {
      slug: 'desert-dune-hoodie',
      name: 'Desert Dune Hoodie',
      description: 'Heavyweight cotton-blend hoodie, pre-shrunk, available in 8 colors and sizes S–XXL.',
      categoryId: fashionId,
      priceMinor: 7999n,
      originalPriceMinor: null,
      brand: 'DuneWear',
      rating: 4.6,
      ratingCount: 342,
      inventory: 1200,
      estimatedDeliveryDays: '4–8 days',
      affiliateCommissionPct: 10,
    },
  ];
  const currency = 'USD';
  for (const p of products) {
    const data = {
      supplierId: supplier.id,
      source: 'SUPPLIER',
      name: p.name,
      description: p.description,
      sku: `ALN-${p.slug.slice(0, 12).toUpperCase()}`,
      categoryId: p.categoryId,
      brand: p.brand,
      priceMinor: p.priceMinor,
      originalPriceMinor: p.originalPriceMinor,
      currency,
      inventory: p.inventory,
      images: [`https://picsum.photos/seed/${p.slug}/600/600`, `https://picsum.photos/seed/${p.slug}-2/600/600`],
      variants: [],
      rating: p.rating,
      ratingCount: p.ratingCount,
      shippingCountries: ['SA', 'US', 'GB', 'AE'],
      shippingCostMinor: 900n,
      estimatedDeliveryDays: p.estimatedDeliveryDays,
      affiliateCommissionPct: p.affiliateCommissionPct,
      status: 'ACTIVE',
      isActive: true,
    };
    await prisma.marketplaceProduct.upsert({
      where: { slug: p.slug },
      update: { ...data, name: p.name },
      create: { ...data, slug: p.slug },
    });
  }

  // --- Demo affiliate (APPROVED) + a sample link ------------------------------
  await ensureUser(prisma, 'affiliate@demo.test', passwordHash, 'Demo Affiliate');
  const affiliateUser = await prisma.user.findUnique({ where: { email: 'affiliate@demo.test' } });
  const affiliate = await prisma.affiliate.upsert({
    where: { email: 'affiliate@demo.test' },
    update: {},
    create: {
      userId: affiliateUser?.id ?? null,
      fullName: 'Demo Affiliate',
      email: 'affiliate@demo.test',
      countryCode: 'US',
      website: 'https://demoaudience.example',
      trafficSource: 'BLOG',
      niche: 'Tech reviews',
      preferredCategories: ['electronics'],
      payoutMethod: 'PAYPAL',
      code: 'AF777001',
      status: 'APPROVED',
      riskScore: 0,
      approvedAt: new Date(),
    },
  });

  const watch = await prisma.marketplaceProduct.findUnique({ where: { slug: 'aurora-smart-watch-pro' } });
  if (watch !== null) {
    const existingLink = await prisma.affiliateLink.findFirst({ where: { affiliateId: affiliate.id, title: 'Demo link — Aurora Watch' } });
    if (existingLink === null) {
      await prisma.affiliateLink.create({
        data: {
          affiliateId: affiliate.id,
          productId: watch.id,
          type: 'PRODUCT',
          title: 'Demo link — Aurora Watch',
          url: `http://localhost:3000/product/${watch.slug}?ref=${affiliate.code}`,
          trafficSource: 'BLOG',
          countryCode: 'US',
        },
      });
    }
  }

  // --- Tasks & offers (spec §20/§21, MOCK providers) -------------------------
  await ensureTask(prisma, {
    provider: 'MOCK',
    title: 'Tag product images',
    description: 'Confirm whether each product image matches its product name. Approx. 3 minutes.',
    taskType: 'MICRO',
    rewardMinor: 150n,
    estimatedMinutes: 3,
  });
  await ensureTask(prisma, {
    provider: 'MOCK',
    title: 'Rate your shopping experience',
    description: 'Complete a 10-question survey about marketplace checkout UX.',
    taskType: 'SURVEY',
    rewardMinor: 400n,
    estimatedMinutes: 6,
  });
  await ensureTask(prisma, {
    provider: 'MOCK',
    title: 'Test the mobile checkout flow',
    description: 'Walk through a simulated checkout and report any friction.',
    taskType: 'USER_TESTING',
    rewardMinor: 1000n,
    estimatedMinutes: 12,
  });
  await ensureOffer(prisma, {
    provider: 'MOCK',
    title: 'Install the companion app',
    description: 'Download and open the demo app, then return to claim the reward.',
    rewardMinor: 750n,
    estimatedMinutes: 5,
  });
  await ensureOffer(prisma, {
    provider: 'MOCK',
    title: 'Watch a short product video',
    description: 'Watch a 45-second product video in the video library.',
    rewardMinor: 300n,
    estimatedMinutes: 2,
  });

  // eslint-disable-next-line no-console -- seed CLI output
  console.log('[seed] Marketplace ready: 33 country configs, 10 categories, 4 products, 1 supplier, 1 affiliate, 3 tasks, 2 offers.');
}

async function ensureUser(
  prisma: PrismaClient,
  email: string,
  passwordHash: string,
  name: string,
): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing === null) {
    await prisma.user.create({ data: { email, passwordHash, name, locale: 'en' } });
  }
}

async function ensureTask(
  prisma: PrismaClient,
  input: { provider: string; title: string; description: string; taskType: string; rewardMinor: bigint; estimatedMinutes: number },
): Promise<void> {
  const existing = await prisma.task.findFirst({ where: { title: input.title } });
  if (existing === null) {
    await prisma.task.create({
      data: {
        provider: input.provider,
        title: input.title,
        description: input.description,
        taskType: input.taskType,
        rewardMinor: input.rewardMinor,
        currency: 'USD',
        estimatedMinutes: input.estimatedMinutes,
        countryAvailability: [],
        deviceCompatibility: ['MOBILE', 'DESKTOP'],
        isActive: true,
      },
    });
  }
}

async function ensureOffer(
  prisma: PrismaClient,
  input: { provider: string; title: string; description: string; rewardMinor: bigint; estimatedMinutes: number },
): Promise<void> {
  const existing = await prisma.offer.findFirst({ where: { title: input.title } });
  if (existing === null) {
    await prisma.offer.create({
      data: {
        provider: input.provider,
        title: input.title,
        description: input.description,
        rewardMinor: input.rewardMinor,
        currency: 'USD',
        estimatedMinutes: input.estimatedMinutes,
        countryAvailability: [],
        deviceCompatibility: ['MOBILE', 'DESKTOP'],
        isActive: true,
      },
    });
  }
}
