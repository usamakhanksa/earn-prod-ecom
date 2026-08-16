import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import type { Prisma, Tenant, User } from '@prisma/client';
import type { PrintAreaSpec } from '@omnisell/shared';
import { encryptSecret, generateDek, maskSecret, wrapDek } from '@omnisell/connectors';
import { computePrice, type PricingRuleConfig } from '../src/catalog/pricing/pricing.engine';
import { runPreflight } from '../src/studio/preflight/preflight.engine';
import { seedConnectorRegistry } from './connector-registry-seed';
import { seedMarketplace } from './seed-marketplace';
import { env } from '../src/config/env';

/**
 * Demo seed (dev/test only). Creates: demo tenant, standard demo users, a consumer user
 * with a wallet funded through VALIDATED EARN transactions (never a raw balance write),
 * a video-watch earning rule, a sample video, and tenant point settings.
 */

const DEMO_PASSWORD = 'Demo!2345';

export async function seed(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hash(DEMO_PASSWORD);

  const tenant = await ensureTenant(prisma, {
    slug: 'demo',
    name: 'Demo Studio',
    currency: 'USD',
    timezone: 'Asia/Riyadh',
    plan: 'pro',
  });

  const owner = await ensureUser(prisma, 'owner@demo.test', passwordHash, 'Demo Owner');
  const designer = await ensureUser(prisma, 'designer@demo.test', passwordHash, 'Demo Designer');
  const finance = await ensureUser(prisma, 'finance@demo.test', passwordHash, 'Demo Finance');
  const consumer = await ensureUser(prisma, 'consumer@demo.test', passwordHash, 'Demo Consumer');

  await ensureMembership(prisma, tenant.id, owner.id, 'OWNER');
  await ensureMembership(prisma, tenant.id, designer.id, 'DESIGNER');
  await ensureMembership(prisma, tenant.id, finance.id, 'FINANCE');
  await ensureMembership(prisma, tenant.id, consumer.id, 'MEMBER');

  // Platform-admin persona for the /admin console (Phase 1.8 — no tenant
  // membership on purpose; platform staff operate above any single tenant).
  await ensurePlatformAdmin(prisma, 'platform-admin@demo.test', passwordHash, 'Demo Platform Admin');

  // Point settings + earning rule + sample video (docs/points-extension.md §13)
  await prisma.tenantPointSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      currencyCode: 'USD',
      pointsPerCurrencyMinor: 1,
      minRedeemPoints: 100,
      maxRedeemSharePct: 50,
    },
  });

  await prisma.pointEarningRule.upsert({
    where: { tenantId_action: { tenantId: tenant.id, action: 'video_watch' } },
    update: {},
    create: {
      tenantId: tenant.id,
      action: 'video_watch',
      points: 50,
      minWatchSeconds: 30,
      maxDailyCap: 200,
      isActive: true,
    },
  });

  await ensureVideo(prisma, tenant.id);

  // Fund the consumer wallet with VALIDATED EARN transactions (2,000 points total).
  await ensureWalletFunding(prisma, tenant.id, consumer.id);

  // Phase 2 — Studio & Catalog: hand-seeded blueprint cache (docs/DEBT.md
  // 0-D8 — no live connector sync exists yet) + a demo product exercising
  // the real variant-matrix/preflight/pricing engines end-to-end.
  await seedCatalog(prisma, tenant.id, designer.id);

  // Phase 3 — Connector Framework: global registry (prompt.md's spine) +
  // one demo Connection with a REAL envelope-encrypted (fake) credential and
  // a handful of ConnectionHealthSample rows, explicitly flagged
  // `isSeedData: true` so the connection-health-board UI never confuses this
  // for live traffic (implentationplanphase.md task 3.11 — Publishing, which
  // would generate real traffic, is Phase 4).
  await seedConnectorRegistry(prisma);
  await seedDemoConnection(prisma, tenant.id, owner.id);

  // Phase 4 — Publishing Pipeline & Export Packs: one demo DRAFT Listing
  // exercising the real per-(product,connection) shape against the demo
  // product/connection above, plus the global banned-term dictionary's
  // first real row (implentationplanphase.md task 4.11).
  await seedPublishing(prisma, tenant.id, designer.id);
  await seedBannedTerms(prisma);

  // Global Marketplace (ecom-front.txt): countries, storefront catalog,
  // supplier + affiliate demo personas, commission rules, MOCK tasks/offers.
  await seedMarketplace(prisma);

  // eslint-disable-next-line no-console -- seed CLI output, not application logging
  console.log(
    '[seed] Demo data ready. Logins: owner/designer/finance/consumer/platform-admin@demo.test / Demo!2345',
  );
}

async function ensurePlatformAdmin(
  prisma: PrismaClient,
  email: string,
  passwordHash: string,
  name: string,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    return existing;
  }
  return prisma.user.create({
    data: { email, passwordHash, name, locale: 'en', isPlatformAdmin: true, emailVerifiedAt: new Date() },
  });
}

async function ensureTenant(
  prisma: PrismaClient,
  input: Pick<Tenant, 'slug' | 'name' | 'currency' | 'timezone' | 'plan'>,
): Promise<Tenant> {
  const existing = await prisma.tenant.findUnique({ where: { slug: input.slug } });
  if (existing !== null) {
    return existing;
  }
  return prisma.tenant.create({ data: input });
}

async function ensureUser(
  prisma: PrismaClient,
  email: string,
  passwordHash: string,
  name: string,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    return existing;
  }
  return prisma.user.create({ data: { email, passwordHash, name, locale: 'en' } });
}

async function ensureMembership(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  const existing = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  if (existing === null) {
    await prisma.membership.create({ data: { tenantId, userId, role, isActive: true } });
  }
}

async function ensureVideo(prisma: PrismaClient, tenantId: string): Promise<void> {
  const existing = await prisma.videoContent.findFirst({ where: { tenantId, isActive: true } });
  if (existing !== null) {
    return;
  }
  await prisma.videoContent.create({
    data: {
      tenantId,
      title: 'Welcome to Demo Studio — earn your first points',
      url: 'https://demo.cdn.omnisell.test/welcome.mp4',
      durationSeconds: 90,
      thumbnailUrl: 'https://demo.cdn.omnisell.test/welcome-thumb.jpg',
      pointsPerView: 50,
      isActive: true,
    },
  });
}

async function ensureWalletFunding(prisma: PrismaClient, tenantId: string, userId: string): Promise<void> {
  const wallet = await prisma.wallet.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {},
    create: { tenantId, userId, balance: 0n, version: 1 },
  });

  const existing = await prisma.pointTransaction.findFirst({
    where: { walletId: wallet.id, source: 'admin_adjust' },
  });
  if (existing !== null) {
    return; // already funded
  }

  const now = new Date();
  const rows = [
    { source: 'admin_adjust', amount: 1500n, metadata: { reason: 'demo_seed_welcome' } },
    { source: 'video_watch', amount: 500n, metadata: { demo: true } },
  ];

  for (const row of rows) {
    await prisma.pointTransaction.create({
      data: {
        walletId: wallet.id,
        tenantId,
        userId,
        type: 'EARN',
        amount: row.amount,
        source: row.source,
        sourceId: row.source === 'video_watch' ? randomUUID() : null,
        metadata: row.metadata,
        status: 'VALIDATED',
        validatedAt: now,
        expiresAt: addDays(now, 365),
      },
    });
  }

  const derived = rows.reduce((acc, row) => acc + row.amount, 0n);
  const updated = await prisma.wallet.updateMany({
    where: { id: wallet.id, version: wallet.version },
    data: { balance: derived, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new Error('Wallet CAS update failed during seeding — concurrent modification detected');
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// ---------------------------------------------------------------------------
// Phase 3 — Connector Framework demo data (implentationplanphase.md task
// 3.11: connection health board needs "a small amount of realistic sample
// data for the demo tenant, clearly labeled as seed/demo data"). Uses the
// REAL envelope-encryption primitives (packages/connectors/src/vault) — the
// seeded credential is a fake value, but it round-trips through the exact
// same encrypt/decrypt path a real one would, so this is a genuine exercise
// of the vault, not a shortcut.
// ---------------------------------------------------------------------------

async function seedDemoConnection(prisma: PrismaClient, tenantId: string, ownerId: string): Promise<void> {
  const printful = await prisma.connectorDefinition.findUnique({ where: { slug: 'printful' } });
  if (printful === null) {
    return; // seedConnectorRegistry() runs immediately before this — defensive only
  }

  const connection = await prisma.connection.upsert({
    where: { id: `${tenantId}-demo-printful-connection` }, // deterministic id keeps seeding idempotent
    update: {},
    create: {
      id: `${tenantId}-demo-printful-connection`,
      tenantId,
      connectorId: printful.id,
      connectorSlug: 'printful',
      label: 'Demo Studio — Printful',
      status: 'CONNECTED',
      authType: 'API_KEY',
      sandbox: false,
      externalAccountId: 'demo-store-1',
      externalAccountLabel: 'Demo Studio Store',
      createdById: ownerId,
      lastSuccessAt: new Date(),
      lastTestedAt: new Date(),
    },
  });

  const existingCredential = await prisma.credential.findFirst({ where: { tenantId, connectionId: connection.id } });
  if (existingCredential === null) {
    const tenantDataKey = await prisma.tenantDataKey.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, wrappedDek: wrapDek(generateDek(), env.KMS_MASTER_KEY), kmsKeyId: 'env-v1' },
    });
    // Re-derive the DEK from what was just stored (rather than reusing the
    // generated Buffer directly) — proves the wrap→unwrap round-trip works,
    // the same path CredentialVaultService.getOrCreateTenantDek takes.
    const { unwrapDek } = await import('@omnisell/connectors');
    const dek = unwrapDek(tenantDataKey.wrappedDek, env.KMS_MASTER_KEY);
    const fakeApiKey = 'demo_fake_printful_key_9c41a7';
    await prisma.credential.create({
      data: {
        tenantId,
        connectionId: connection.id,
        kind: 'API_KEY',
        encryptedBlob: encryptSecret(fakeApiKey, dek),
        dekTenantKeyId: tenantDataKey.id,
        maskedHint: maskSecret(fakeApiKey),
        isActive: true,
      },
    });
  }

  const existingSamples = await prisma.connectionHealthSample.count({ where: { tenantId, connectionId: connection.id } });
  if (existingSamples > 0) {
    return;
  }

  const now = Date.now();
  const demoSamples: Array<{ offsetMinutes: number; success: boolean; latencyMs: number; errorCode?: string; errorMessage?: string }> = [
    { offsetMinutes: 240, success: true, latencyMs: 180 },
    { offsetMinutes: 180, success: true, latencyMs: 210 },
    { offsetMinutes: 120, success: false, latencyMs: 2400, errorCode: 'RATE_LIMITED', errorMessage: 'Printful is rate-limiting this connection — retrying automatically with backoff.' },
    { offsetMinutes: 60, success: true, latencyMs: 195 },
    { offsetMinutes: 5, success: true, latencyMs: 165 },
  ];
  for (const sample of demoSamples) {
    await prisma.connectionHealthSample.create({
      data: {
        tenantId,
        connectionId: connection.id,
        checkedAt: new Date(now - sample.offsetMinutes * 60_000),
        success: sample.success,
        latencyMs: sample.latencyMs,
        errorCode: sample.errorCode ?? null,
        errorMessage: sample.errorMessage ?? null,
        rateLimitRemaining: sample.success ? 118 : 0,
        isSeedData: true,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Studio & Catalog seed (docs/DEBT.md 0-D8: hand-seeded blueprint
// cache, no live connector sync exists yet). The demo product below is built
// by calling the REAL preflight/pricing engines at seed time, not by writing
// pre-computed numbers — so the seeded margin/preflight data is exactly what
// a live run of those engines would produce.
// ---------------------------------------------------------------------------

const TSHIRT_SIZES: readonly string[] = ['S', 'M', 'L', 'XL'];
const TSHIRT_COLORS: readonly string[] = ['White', 'Black', 'Navy', 'Heather Grey', 'Red', 'Royal Blue'];
const TSHIRT_COLOR_HEX: Record<string, string> = {
  White: '#FFFFFF',
  Black: '#0A0A0A',
  Navy: '#1B2A4A',
  'Heather Grey': '#B5B2AD',
  Red: '#C8102E',
  'Royal Blue': '#1E3A8A',
};

const HOODIE_SIZES: readonly string[] = ['S', 'M', 'L', 'XL'];
const HOODIE_COLORS: readonly string[] = ['Black', 'White', 'Navy', 'Heather Grey'];

const MUG_COLORS: readonly string[] = ['White', 'Black', 'Two-Tone'];

const TSHIRT_PRINT_AREAS: PrintAreaSpec[] = [
  {
    code: 'FRONT',
    name: 'Front',
    widthIn: 12,
    heightIn: 16,
    dpiMin: 150,
    dpiRecommended: 300,
    bleedIn: 0.125,
    safeAreaIn: 0.25,
    allowsTransparency: true,
    colorProfile: 'RGB',
    maxFileSizeMb: 50,
  },
  {
    code: 'BACK',
    name: 'Back',
    widthIn: 12,
    heightIn: 16,
    dpiMin: 150,
    dpiRecommended: 300,
    bleedIn: 0.125,
    safeAreaIn: 0.25,
    allowsTransparency: true,
    colorProfile: 'RGB',
    maxFileSizeMb: 50,
  },
];

const HOODIE_PRINT_AREAS: PrintAreaSpec[] = [
  {
    code: 'FRONT',
    name: 'Front',
    widthIn: 10,
    heightIn: 12,
    dpiMin: 150,
    dpiRecommended: 300,
    bleedIn: 0.125,
    safeAreaIn: 0.25,
    allowsTransparency: true,
    colorProfile: 'RGB',
    maxFileSizeMb: 50,
  },
];

const MUG_PRINT_AREAS: PrintAreaSpec[] = [
  {
    code: 'ALL_OVER',
    name: 'Wrap',
    widthIn: 8.3,
    heightIn: 3.3,
    dpiMin: 150,
    dpiRecommended: 300,
    bleedIn: 0.0625,
    safeAreaIn: 0.125,
    allowsTransparency: false,
    colorProfile: 'CMYK',
    maxFileSizeMb: 25,
  },
];

async function seedCatalog(prisma: PrismaClient, tenantId: string, designerId: string): Promise<void> {
  const tshirt = await ensureBlueprint(prisma, tenantId, {
    providerBlueprintId: 'bp_tshirt_unisex_1',
    name: 'Unisex Classic T-Shirt',
    category: 'APPAREL',
    printAreas: TSHIRT_PRINT_AREAS,
    sizes: TSHIRT_SIZES,
    colors: TSHIRT_COLORS.map((name) => ({ name, hex: TSHIRT_COLOR_HEX[name] ?? '#000000' })),
  });
  await ensureBlueprintVariants(prisma, tenantId, tshirt.id, TSHIRT_SIZES, TSHIRT_COLORS, (size) =>
    // Larger sizes cost marginally more, mirroring real POD provider pricing.
    1050n + BigInt(TSHIRT_SIZES.indexOf(size)) * 100n,
  );

  const hoodie = await ensureBlueprint(prisma, tenantId, {
    providerBlueprintId: 'bp_hoodie_pullover_1',
    name: 'Unisex Pullover Hoodie',
    category: 'APPAREL',
    printAreas: HOODIE_PRINT_AREAS,
    sizes: HOODIE_SIZES,
    colors: HOODIE_COLORS.map((name) => ({ name, hex: TSHIRT_COLOR_HEX[name] ?? '#000000' })),
  });
  await ensureBlueprintVariants(prisma, tenantId, hoodie.id, HOODIE_SIZES, HOODIE_COLORS, (size) =>
    2400n + BigInt(HOODIE_SIZES.indexOf(size)) * 150n,
  );

  const mug = await ensureBlueprint(prisma, tenantId, {
    providerBlueprintId: 'bp_mug_11oz_1',
    name: 'Ceramic Mug 11oz',
    category: 'DRINKWARE',
    printAreas: MUG_PRINT_AREAS,
    sizes: ['11oz'],
    colors: MUG_COLORS.map((name) => ({ name, hex: '#FFFFFF' })),
  });
  await ensureBlueprintVariants(prisma, tenantId, mug.id, ['11oz'], MUG_COLORS, () => 650n);

  await ensureMockupTemplate(prisma, tenantId, tshirt.id);
  await ensureDemoProduct(prisma, tenantId, designerId, tshirt.id);
}

async function ensureBlueprint(
  prisma: PrismaClient,
  tenantId: string,
  input: { providerBlueprintId: string; name: string; category: string; printAreas: PrintAreaSpec[]; sizes: readonly string[]; colors: Array<{ name: string; hex: string }> },
) {
  return prisma.blueprint.upsert({
    where: { tenantId_providerSlug_providerBlueprintId: { tenantId, providerSlug: 'printful', providerBlueprintId: input.providerBlueprintId } },
    update: {},
    create: {
      tenantId,
      providerSlug: 'printful',
      providerBlueprintId: input.providerBlueprintId,
      name: input.name,
      category: input.category,
      printAreas: input.printAreas as unknown as Prisma.InputJsonValue,
      sizes: input.sizes as unknown as Prisma.InputJsonValue,
      colors: input.colors as unknown as Prisma.InputJsonValue,
    },
  });
}

async function ensureBlueprintVariants(
  prisma: PrismaClient,
  tenantId: string,
  blueprintId: string,
  sizes: readonly string[],
  colors: readonly string[],
  costForSize: (size: string) => bigint,
): Promise<void> {
  for (const size of sizes) {
    for (const color of colors) {
      const providerVariantId = `${blueprintId}:${size}:${color}`.replace(/\s+/g, '_');
      await prisma.blueprintVariant.upsert({
        where: { blueprintId_providerVariantId: { blueprintId, providerVariantId } },
        update: {},
        create: {
          blueprintId,
          tenantId,
          providerVariantId,
          size,
          color,
          colorHex: TSHIRT_COLOR_HEX[color] ?? null,
          baseCostMinor: costForSize(size),
          currency: 'USD',
        },
      });
    }
  }
}

async function ensureMockupTemplate(prisma: PrismaClient, tenantId: string, blueprintId: string): Promise<void> {
  const existing = await prisma.mockupTemplate.findFirst({ where: { tenantId, blueprintId } });
  if (existing !== null) {
    return;
  }
  await prisma.mockupTemplate.create({
    data: {
      tenantId,
      blueprintId,
      placementCode: 'FRONT',
      name: 'Flat lay — front',
      // No live object storage in this sandbox (docs/DEBT.md) — this key
      // points at nothing real; composing against it will honestly 503.
      sceneKey: `tenants/${tenantId}/mockup-scenes/tshirt-flatlay-front.png`,
      sceneWidthPx: 1600,
      sceneHeightPx: 1600,
      printAreaX: 550,
      printAreaY: 420,
      printAreaWidth: 500,
      printAreaHeight: 650,
      rotationDeg: 0,
    },
  });
}

/**
 * Demo product exercising the Phase 2 exit criteria end to end: a 24-variant
 * matrix (4 sizes x 6 colours), a real preflight report computed by the same
 * engine the API uses, a pricing rule, and per-variant prices computed by the
 * same pricing engine the API uses — not hand-typed numbers.
 */
async function ensureDemoProduct(prisma: PrismaClient, tenantId: string, designerId: string, blueprintId: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { tenantId, sku: 'DEMO-TEE-001' } });
  if (existing !== null) {
    return;
  }

  const asset = await prisma.asset.create({
    data: {
      tenantId,
      name: 'demo-logo-front.png',
      kind: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 4_200_000,
      storageKey: `tenants/${tenantId}/assets/demo-logo-front.png`,
      widthPx: 3600,
      heightPx: 4800,
      dpi: 300,
      colorProfile: 'RGB',
      hasTransparency: true,
      status: 'READY',
      createdById: designerId,
      currentVersion: 1,
    },
  });
  await prisma.assetVersion.create({
    data: {
      assetId: asset.id,
      tenantId,
      versionNumber: 1,
      storageKey: asset.storageKey,
      sizeBytes: asset.sizeBytes,
      mimeType: asset.mimeType,
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      dpi: asset.dpi,
      createdById: designerId,
    },
  });

  const preflight = runPreflight(
    {
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      dpi: asset.dpi,
      colorProfile: 'RGB',
      hasTransparency: true,
      minStrokeWidthPx: null,
      sizeBytes: asset.sizeBytes,
    },
    TSHIRT_PRINT_AREAS[0],
  );
  await prisma.preflightReport.create({
    data: {
      tenantId,
      assetId: asset.id,
      blueprintId,
      placementCode: 'FRONT',
      overallStatus: preflight.overallStatus,
      rules: preflight.rules as unknown as Prisma.InputJsonValue,
    },
  });

  const product = await prisma.product.create({
    data: {
      tenantId,
      name: 'Demo Logo Tee',
      description: 'Seed demo product exercising the Phase 2 exit criteria end to end.',
      sku: 'DEMO-TEE-001',
      status: 'ACTIVE',
      blueprintId,
      primaryAssetId: asset.id,
      priceMinor: 2999n,
      currency: 'USD',
    },
  });

  await prisma.designPlacement.create({
    data: { tenantId, productId: product.id, placementCode: 'FRONT', assetId: asset.id, xPct: 0.5, yPct: 0.35, scalePct: 80, rotationDeg: 0 },
  });

  const pricingRule = await prisma.pricingRule.create({
    data: {
      tenantId,
      name: 'Standard apparel — 40% margin, .99 rounding',
      method: 'FIXED_MARGIN',
      fixedMarginPct: 40,
      roundingMode: 'PSYCHOLOGICAL_99',
      isActive: true,
    },
  });
  const engineConfig: PricingRuleConfig = { method: 'FIXED_MARGIN', fixedMarginPct: 40, roundingMode: 'PSYCHOLOGICAL_99' };

  const blueprintVariants = await prisma.blueprintVariant.findMany({ where: { tenantId, blueprintId } });
  let createdVariants = 0;
  for (const size of TSHIRT_SIZES) {
    for (const color of TSHIRT_COLORS) {
      const bpVariant = blueprintVariants.find((v) => v.size === size && v.color === color);
      const baseCostMinor = bpVariant?.baseCostMinor ?? 1050n;
      const sku = `DEMO-TEE-001-${size}-${color}`.toUpperCase().replace(/\s+/g, '-');
      const variant = await prisma.productVariant.create({
        data: {
          tenantId,
          productId: product.id,
          blueprintVariantId: bpVariant?.id ?? null,
          sku,
          size,
          color,
          isEnabled: true,
          baseCostMinor,
          currency: 'USD',
        },
      });
      createdVariants += 1;
      const priceMinor = computePrice(engineConfig, baseCostMinor, { currency: 'USD' });
      await prisma.variantPrice.create({
        data: {
          tenantId,
          variantId: variant.id,
          channel: 'default',
          currency: 'USD',
          priceMinor,
          pricingRuleId: pricingRule.id,
        },
      });
    }
  }

  // eslint-disable-next-line no-console -- seed CLI output, not application logging
  console.log(
    `[seed] Catalog ready: 3 blueprints hand-seeded (docs/DEBT.md 0-D8), demo product '${product.sku}' with ${createdVariants} variants, preflight=${preflight.overallStatus}.`,
  );
}

/**
 * Phase 4 — one demo DRAFT `Listing` (prompt.md's per-(Product,Connection)
 * shape) against the demo product ('DEMO-TEE-001') and the demo Printful
 * connection seeded above — real rows a Docker-enabled machine can open in
 * the composer/detail UI immediately, not a fixture only the seed script
 * itself understands.
 */
async function seedPublishing(prisma: PrismaClient, tenantId: string, designerId: string): Promise<void> {
  const product = await prisma.product.findFirst({ where: { tenantId, sku: 'DEMO-TEE-001' } });
  const connection = await prisma.connection.findUnique({ where: { id: `${tenantId}-demo-printful-connection` } });
  if (product === null || connection === null) {
    return; // seedCatalog()/seedDemoConnection() run immediately before this — defensive only
  }

  const variant = await prisma.productVariant.findFirst({ where: { tenantId, productId: product.id }, include: { prices: true } });
  if (variant === null) {
    return;
  }
  const defaultPrice = variant.prices.find((p) => p.channel === 'default');

  const listingId = `${tenantId}-demo-listing-printful`;
  const listing = await prisma.listing.upsert({
    where: { id: listingId },
    update: {},
    create: {
      id: listingId,
      tenantId,
      productId: product.id,
      connectionId: connection.id,
      connectorSlug: connection.connectorSlug,
      title: 'Demo Tee — Sunset Print',
      description: 'A soft, breathable tee with an original sunset design. Printed on demand.',
      tags: ['sunset', 'tee', 'graphic-print'],
      status: 'DRAFT',
      createdById: designerId,
    },
  });

  await prisma.listingVariant.upsert({
    where: { listingId_productVariantId: { listingId: listing.id, productVariantId: variant.id } },
    update: {},
    create: {
      tenantId,
      listingId: listing.id,
      productVariantId: variant.id,
      priceMinor: defaultPrice?.priceMinor ?? variant.baseCostMinor,
      currency: defaultPrice?.currency ?? variant.currency,
      status: 'PENDING',
    },
  });

  const hasEvent = await prisma.listingEvent.findFirst({ where: { tenantId, listingId: listing.id } });
  if (hasEvent === null) {
    await prisma.listingEvent.create({
      data: { tenantId, listingId: listing.id, type: 'STATUS_CHANGE', message: 'Draft created for Printful', actorId: designerId },
    });
  }

  // eslint-disable-next-line no-console -- seed CLI output, not application logging
  console.log(`[seed] Publishing ready: demo listing '${listing.title}' (DRAFT) targeting ${connection.label}.`);
}

/**
 * The global IP/trademark policy linter's dictionary (implentationplanphase.md
 * task 4.11) — one real, working example row so `BannedTermsService.lint`
 * (and the admin moderation screen) has something genuine to demonstrate
 * against without a human first typing it into the UI.
 */
async function seedBannedTerms(prisma: PrismaClient): Promise<void> {
  await prisma.bannedTerm.upsert({
    where: { term_category: { term: 'Disney', category: 'TRADEMARK' } },
    update: {},
    create: { term: 'Disney', category: 'TRADEMARK', matchType: 'FUZZY', note: 'Seed example — a real trademark, fuzzy-matched to catch obfuscated spellings.', createdBy: 'seed-script' },
  });
}