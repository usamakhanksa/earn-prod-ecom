/**
 * Seed data for the MOCK_MODE in-memory product catalog
 * (MockProductRepository) — and, once a live database exists, for
 * `prisma/seed.ts`'s real-DB seeding of the exact same rows (see DEBT.md:
 * never exercised against a live Postgres in this sandbox).
 *
 * A few dozen products across 8 categories, deliberately varied by country
 * availability so the country product rule engine
 * (packages/marketplace-country's CountryProductRulesService) has real data
 * to filter against — not a single flat "available everywhere" catalog.
 */

export const ALL_SEEDED_COUNTRIES: readonly string[] = [
  'SA',
  'US',
  'GB',
  'DE',
  'IN',
  'PK',
  'BR',
  'NG',
  'AU',
];
const WESTERN_MARKETS: readonly string[] = ['US', 'GB', 'DE', 'AU'];
/** Everywhere alcohol is legally sold on a general marketplace among the 9 seeded countries. */
const ALCOHOL_MARKETS: readonly string[] = ['US', 'GB', 'DE', 'IN', 'BR', 'NG', 'AU'];

export interface CategorySeedInput {
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ProductCountryAvailabilitySeed {
  countryCode: string;
  isAvailable?: boolean;
  /** Country-specific price override. Omit to use basePrice/baseCurrency. */
  price?: number;
  currency?: string;
}

export interface ProductVariantSeedInput {
  sku: string;
  name: string;
  price: number;
  currency?: string;
  stock: number;
  attributes?: Record<string, string>;
  /** Per-country warehouse stock. Omit for a variant with no country-level inventory tracked yet. */
  inventory?: Array<{ countryCode: string; quantity: number; reservedQuantity?: number }>;
}

export interface ProductSeedInput {
  sku: string;
  slug: string;
  title: string;
  description: string;
  basePrice: number;
  baseCurrency?: string;
  compareAtPrice?: number;
  rating?: number;
  ratingCount?: number;
  defaultShippingDays?: number;
  categorySlug: string;
  images: Array<{ url: string; altText?: string }>;
  variants?: ProductVariantSeedInput[];
  countryAvailability: ProductCountryAvailabilitySeed[];
}

function availabilityFor(
  countries: readonly string[],
  overrides: Record<string, { price?: number; currency?: string }> = {},
): ProductCountryAvailabilitySeed[] {
  return countries.map((countryCode) => ({
    countryCode,
    isAvailable: true,
    ...overrides[countryCode],
  }));
}

function img(seed: string, altText: string): { url: string; altText: string } {
  // Deterministic placeholder image URLs (picsum.photos "seed" mode returns
  // the same image for the same seed string) — not a live fetch during
  // tests/build, just a stored string in the seeded catalog data.
  return { url: `https://picsum.photos/seed/globalmart-${seed}/640/640`, altText };
}

export const CATEGORY_SEED: CategorySeedInput[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    description: 'Phones, audio, wearables, and everyday gadgets.',
    imageUrl: img('cat-electronics', 'Electronics').url,
    sortOrder: 1,
  },
  {
    slug: 'fashion-apparel',
    name: 'Fashion & Apparel',
    description: 'Clothing, footwear, and accessories for every season.',
    imageUrl: img('cat-fashion', 'Fashion & Apparel').url,
    sortOrder: 2,
  },
  {
    slug: 'home-kitchen',
    name: 'Home & Kitchen',
    description: 'Cookware, appliances, and everyday home essentials.',
    imageUrl: img('cat-home', 'Home & Kitchen').url,
    sortOrder: 3,
  },
  {
    slug: 'beauty-personal-care',
    name: 'Beauty & Personal Care',
    description: 'Skincare, haircare, and personal care essentials.',
    imageUrl: img('cat-beauty', 'Beauty & Personal Care').url,
    sortOrder: 4,
  },
  {
    slug: 'sports-outdoors',
    name: 'Sports & Outdoors',
    description: 'Fitness gear, camping equipment, and outdoor essentials.',
    imageUrl: img('cat-sports', 'Sports & Outdoors').url,
    sortOrder: 5,
  },
  {
    slug: 'toys-games',
    name: 'Toys & Games',
    description: 'Toys, puzzles, and games for all ages.',
    imageUrl: img('cat-toys', 'Toys & Games').url,
    sortOrder: 6,
  },
  {
    slug: 'books-media',
    name: 'Books & Media',
    description: 'Fiction, non-fiction, and media for every reader.',
    imageUrl: img('cat-books', 'Books & Media').url,
    sortOrder: 7,
  },
  {
    slug: 'alcohol-spirits',
    name: 'Alcohol & Spirits',
    description: 'Wine, spirits, and craft beverages. Restricted in some countries.',
    imageUrl: img('cat-alcohol', 'Alcohol & Spirits').url,
    sortOrder: 8,
  },
];

export const PRODUCT_SEED: ProductSeedInput[] = [
  // --- Electronics -------------------------------------------------------
  {
    sku: 'ELEC-EARBUDS-001',
    slug: 'wireless-earbuds-pro',
    title: 'Wireless Earbuds Pro',
    description: 'Active noise-cancelling true wireless earbuds with 30-hour battery life.',
    basePrice: 59.99,
    compareAtPrice: 89.99,
    rating: 4.5,
    ratingCount: 2143,
    defaultShippingDays: 4,
    categorySlug: 'electronics',
    images: [img('earbuds-1', 'Wireless Earbuds Pro')],
    variants: [
      { sku: 'ELEC-EARBUDS-001-BLK', name: 'Black', price: 59.99, stock: 240 },
      { sku: 'ELEC-EARBUDS-001-WHT', name: 'White', price: 59.99, stock: 180 },
    ],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES, {
      SA: { price: 224.96, currency: 'SAR' },
    }),
  },
  {
    sku: 'ELEC-CAM-002',
    slug: '4k-action-camera',
    title: '4K Action Camera',
    description: 'Waterproof 4K/60fps action camera with image stabilization.',
    basePrice: 129.0,
    compareAtPrice: 159.0,
    rating: 4.3,
    ratingCount: 876,
    defaultShippingDays: 6,
    categorySlug: 'electronics',
    images: [img('action-cam-1', '4K Action Camera')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'ELEC-WATCH-003',
    slug: 'smart-fitness-watch',
    title: 'Smart Fitness Watch',
    description: 'Heart-rate, SpO2, and sleep tracking with a 7-day battery.',
    basePrice: 79.5,
    rating: 4.2,
    ratingCount: 1509,
    defaultShippingDays: 5,
    categorySlug: 'electronics',
    images: [img('smartwatch-1', 'Smart Fitness Watch')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'ELEC-SPEAKER-004',
    slug: 'portable-bluetooth-speaker',
    title: 'Portable Bluetooth Speaker',
    description: 'IPX7 waterproof speaker with 20 hours of playtime.',
    basePrice: 34.99,
    compareAtPrice: 44.99,
    rating: 4.6,
    ratingCount: 3021,
    defaultShippingDays: 4,
    categorySlug: 'electronics',
    images: [img('speaker-1', 'Portable Bluetooth Speaker')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'ELEC-CHARGER-005',
    slug: 'usb-c-fast-charger-65w',
    title: 'USB-C Fast Charger 65W',
    description: 'Compact GaN charger, fast-charges laptops and phones alike.',
    basePrice: 24.0,
    rating: 4.7,
    ratingCount: 987,
    defaultShippingDays: 3,
    categorySlug: 'electronics',
    images: [img('charger-1', 'USB-C Fast Charger 65W')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },

  // --- Fashion & Apparel ---------------------------------------------------
  {
    sku: 'FASH-JACKET-001',
    slug: 'mens-slim-fit-jacket',
    title: "Men's Slim Fit Jacket",
    description: 'Water-resistant slim fit jacket for everyday wear.',
    basePrice: 45.0,
    compareAtPrice: 65.0,
    rating: 4.1,
    ratingCount: 412,
    defaultShippingDays: 5,
    categorySlug: 'fashion-apparel',
    images: [img('jacket-1', "Men's Slim Fit Jacket")],
    variants: [
      { sku: 'FASH-JACKET-001-M', name: 'Medium', price: 45.0, stock: 60 },
      { sku: 'FASH-JACKET-001-L', name: 'Large', price: 45.0, stock: 50 },
    ],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'FASH-DRESS-002',
    slug: 'womens-summer-maxi-dress',
    title: "Women's Summer Maxi Dress",
    description: 'Lightweight breathable maxi dress in floral print.',
    basePrice: 38.5,
    rating: 4.4,
    ratingCount: 690,
    defaultShippingDays: 5,
    categorySlug: 'fashion-apparel',
    images: [img('dress-1', "Women's Summer Maxi Dress")],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'FASH-SNEAKER-003',
    slug: 'unisex-canvas-sneakers',
    title: 'Unisex Canvas Sneakers',
    description: 'Classic low-top canvas sneakers, true to size.',
    basePrice: 29.99,
    compareAtPrice: 39.99,
    rating: 4.3,
    ratingCount: 1834,
    defaultShippingDays: 4,
    categorySlug: 'fashion-apparel',
    images: [img('sneakers-1', 'Unisex Canvas Sneakers')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'FASH-BELT-004',
    slug: 'classic-leather-belt',
    title: 'Classic Leather Belt',
    description: 'Full-grain leather belt with a reversible buckle.',
    basePrice: 19.0,
    rating: 4.0,
    ratingCount: 233,
    defaultShippingDays: 4,
    categorySlug: 'fashion-apparel',
    images: [img('belt-1', 'Classic Leather Belt')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'FASH-SWEATER-005',
    slug: 'merino-wool-sweater',
    title: 'Merino Wool Sweater',
    description: 'Soft, breathable merino wool crew-neck sweater.',
    basePrice: 55.0,
    compareAtPrice: 75.0,
    rating: 4.5,
    ratingCount: 301,
    defaultShippingDays: 6,
    categorySlug: 'fashion-apparel',
    images: [img('sweater-1', 'Merino Wool Sweater')],
    countryAvailability: availabilityFor(WESTERN_MARKETS),
  },

  // --- Home & Kitchen -------------------------------------------------------
  {
    sku: 'HOME-COOKWARE-001',
    slug: 'stainless-steel-cookware-set',
    title: 'Stainless Steel Cookware Set (10-Piece)',
    description: 'Tri-ply stainless steel cookware set, oven-safe to 500°F.',
    basePrice: 149.0,
    compareAtPrice: 199.0,
    rating: 4.6,
    ratingCount: 542,
    defaultShippingDays: 7,
    categorySlug: 'home-kitchen',
    images: [img('cookware-1', 'Stainless Steel Cookware Set')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'HOME-KETTLE-002',
    slug: 'electric-kettle-1-7l',
    title: 'Electric Kettle 1.7L',
    description: 'Rapid-boil electric kettle with auto shut-off.',
    basePrice: 27.5,
    rating: 4.4,
    ratingCount: 1092,
    defaultShippingDays: 5,
    categorySlug: 'home-kitchen',
    images: [img('kettle-1', 'Electric Kettle 1.7L')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'HOME-VACUUM-003',
    slug: 'robot-vacuum-cleaner',
    title: 'Robot Vacuum Cleaner',
    description: 'App-controlled robot vacuum with mapping navigation.',
    basePrice: 199.99,
    compareAtPrice: 279.99,
    rating: 4.2,
    ratingCount: 764,
    defaultShippingDays: 8,
    categorySlug: 'home-kitchen',
    images: [img('vacuum-1', 'Robot Vacuum Cleaner')],
    countryAvailability: availabilityFor(WESTERN_MARKETS.concat(['SA', 'BR'])),
  },
  {
    sku: 'HOME-PILLOW-004',
    slug: 'memory-foam-pillow-set',
    title: 'Memory Foam Pillow Set (2-Pack)',
    description: 'Cooling-gel memory foam pillows with washable covers.',
    basePrice: 34.0,
    rating: 4.3,
    ratingCount: 615,
    defaultShippingDays: 5,
    categorySlug: 'home-kitchen',
    images: [img('pillow-1', 'Memory Foam Pillow Set')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'HOME-PAN-005',
    slug: 'non-stick-frying-pan',
    title: 'Non-Stick Frying Pan 28cm',
    description: 'PFOA-free non-stick frying pan, induction compatible.',
    basePrice: 18.5,
    rating: 4.5,
    ratingCount: 1288,
    defaultShippingDays: 4,
    categorySlug: 'home-kitchen',
    images: [img('pan-1', 'Non-Stick Frying Pan')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },

  // --- Beauty & Personal Care -----------------------------------------------
  {
    sku: 'BEAUTY-SERUM-001',
    slug: 'vitamin-c-serum',
    title: 'Vitamin C Brightening Serum',
    description: '20% Vitamin C serum for brightening and even skin tone.',
    basePrice: 16.99,
    compareAtPrice: 24.99,
    rating: 4.4,
    ratingCount: 4210,
    defaultShippingDays: 4,
    categorySlug: 'beauty-personal-care',
    images: [img('serum-1', 'Vitamin C Brightening Serum')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BEAUTY-BRUSH-002',
    slug: 'electric-facial-cleansing-brush',
    title: 'Electric Facial Cleansing Brush',
    description: 'Silicone facial cleansing brush with 3 speed settings.',
    basePrice: 22.0,
    rating: 4.1,
    ratingCount: 987,
    defaultShippingDays: 5,
    categorySlug: 'beauty-personal-care',
    images: [img('facebrush-1', 'Electric Facial Cleansing Brush')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BEAUTY-HAIRMASK-003',
    slug: 'argan-oil-hair-mask',
    title: 'Argan Oil Hair Mask',
    description: 'Deep conditioning hair mask with cold-pressed argan oil.',
    basePrice: 13.5,
    rating: 4.6,
    ratingCount: 1622,
    defaultShippingDays: 4,
    categorySlug: 'beauty-personal-care',
    images: [img('hairmask-1', 'Argan Oil Hair Mask')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BEAUTY-TOOTHBRUSH-004',
    slug: 'bamboo-toothbrush-set',
    title: 'Bamboo Toothbrush Set (4-Pack)',
    description: 'Biodegradable bamboo-handle toothbrushes, soft bristles.',
    basePrice: 9.99,
    rating: 4.3,
    ratingCount: 511,
    defaultShippingDays: 4,
    categorySlug: 'beauty-personal-care',
    images: [img('toothbrush-1', 'Bamboo Toothbrush Set')],
    countryAvailability: availabilityFor(WESTERN_MARKETS),
  },
  {
    sku: 'BEAUTY-SUNSCREEN-005',
    slug: 'spf50-sunscreen-lotion',
    title: 'SPF 50 Sunscreen Lotion',
    description: 'Broad-spectrum SPF 50 lotion, lightweight and non-greasy.',
    basePrice: 14.0,
    rating: 4.5,
    ratingCount: 2033,
    defaultShippingDays: 4,
    categorySlug: 'beauty-personal-care',
    images: [img('sunscreen-1', 'SPF 50 Sunscreen Lotion')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },

  // --- Sports & Outdoors -----------------------------------------------------
  {
    sku: 'SPORT-YOGA-001',
    slug: 'yoga-mat-premium',
    title: 'Premium Yoga Mat',
    description: '6mm non-slip TPE yoga mat with carry strap.',
    basePrice: 21.99,
    rating: 4.6,
    ratingCount: 1450,
    defaultShippingDays: 5,
    categorySlug: 'sports-outdoors',
    images: [img('yogamat-1', 'Premium Yoga Mat')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'SPORT-DUMBBELL-002',
    slug: 'adjustable-dumbbell-set',
    title: 'Adjustable Dumbbell Set',
    description: 'Space-saving adjustable dumbbells, 5-25kg per hand.',
    basePrice: 89.0,
    compareAtPrice: 119.0,
    rating: 4.4,
    ratingCount: 320,
    defaultShippingDays: 9,
    categorySlug: 'sports-outdoors',
    images: [img('dumbbell-1', 'Adjustable Dumbbell Set')],
    countryAvailability: availabilityFor(WESTERN_MARKETS.concat(['SA'])),
  },
  {
    sku: 'SPORT-BOTTLE-003',
    slug: 'insulated-water-bottle-1l',
    title: 'Insulated Water Bottle 1L',
    description: 'Double-wall vacuum insulated bottle, keeps cold 24 hours.',
    basePrice: 17.5,
    rating: 4.7,
    ratingCount: 2870,
    defaultShippingDays: 4,
    categorySlug: 'sports-outdoors',
    images: [img('bottle-1', 'Insulated Water Bottle')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'SPORT-TENT-004',
    slug: 'camping-tent-4-person',
    title: 'Camping Tent (4-Person)',
    description: 'Weatherproof 4-person dome tent, 10-minute setup.',
    basePrice: 79.99,
    compareAtPrice: 99.99,
    rating: 4.2,
    ratingCount: 198,
    defaultShippingDays: 8,
    categorySlug: 'sports-outdoors',
    images: [img('tent-1', 'Camping Tent 4-Person')],
    countryAvailability: availabilityFor(WESTERN_MARKETS),
  },
  {
    sku: 'SPORT-BANDS-005',
    slug: 'resistance-bands-set',
    title: 'Resistance Bands Set (5-Piece)',
    description: 'Latex resistance bands, light to heavy, with carry bag.',
    basePrice: 14.99,
    rating: 4.5,
    ratingCount: 1670,
    defaultShippingDays: 4,
    categorySlug: 'sports-outdoors',
    images: [img('bands-1', 'Resistance Bands Set')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },

  // --- Toys & Games -----------------------------------------------------------
  {
    sku: 'TOY-BLOCKS-001',
    slug: 'wooden-building-blocks',
    title: 'Wooden Building Blocks (100-Piece)',
    description: 'Natural wood building block set for ages 3+.',
    basePrice: 24.99,
    rating: 4.7,
    ratingCount: 640,
    defaultShippingDays: 5,
    categorySlug: 'toys-games',
    images: [img('blocks-1', 'Wooden Building Blocks')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'TOY-RCCAR-002',
    slug: 'remote-control-car',
    title: 'Remote Control Off-Road Car',
    description: '1:16 scale RC off-road truck, 30-minute runtime.',
    basePrice: 32.0,
    compareAtPrice: 42.0,
    rating: 4.3,
    ratingCount: 512,
    defaultShippingDays: 6,
    categorySlug: 'toys-games',
    images: [img('rccar-1', 'Remote Control Off-Road Car')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'TOY-PUZZLE-003',
    slug: 'puzzle-1000-pieces',
    title: '1000-Piece Jigsaw Puzzle',
    description: 'World map jigsaw puzzle, 1000 pieces, ages 10+.',
    basePrice: 11.99,
    rating: 4.6,
    ratingCount: 388,
    defaultShippingDays: 4,
    categorySlug: 'toys-games',
    images: [img('puzzle-1', '1000-Piece Jigsaw Puzzle')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'TOY-TEDDY-004',
    slug: 'plush-teddy-bear',
    title: 'Plush Teddy Bear (40cm)',
    description: 'Soft plush teddy bear, machine washable, ages 0+.',
    basePrice: 15.0,
    rating: 4.8,
    ratingCount: 921,
    defaultShippingDays: 4,
    categorySlug: 'toys-games',
    images: [img('teddy-1', 'Plush Teddy Bear')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'TOY-BOARDGAME-005',
    slug: 'board-game-strategy-classic',
    title: 'Strategy Board Game Classic',
    description: 'Classic 2-6 player strategy board game, 60-90 min.',
    basePrice: 28.0,
    rating: 4.5,
    ratingCount: 274,
    defaultShippingDays: 5,
    categorySlug: 'toys-games',
    images: [img('boardgame-1', 'Strategy Board Game Classic')],
    countryAvailability: availabilityFor(WESTERN_MARKETS.concat(['IN', 'BR'])),
  },

  // --- Books & Media -----------------------------------------------------------
  {
    sku: 'BOOK-FICTION-001',
    slug: 'bestselling-fiction-novel',
    title: 'Bestselling Fiction Novel (Paperback)',
    description: "A #1 bestselling fiction novel — reader's edition paperback.",
    basePrice: 12.99,
    rating: 4.6,
    ratingCount: 3390,
    defaultShippingDays: 4,
    categorySlug: 'books-media',
    images: [img('fiction-1', 'Bestselling Fiction Novel')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BOOK-KIDS-002',
    slug: 'childrens-picture-book',
    title: "Children's Picture Book",
    description: 'Illustrated picture book for early readers, ages 3-7.',
    basePrice: 8.5,
    rating: 4.8,
    ratingCount: 1105,
    defaultShippingDays: 4,
    categorySlug: 'books-media',
    images: [img('kidsbook-1', "Children's Picture Book")],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BOOK-COOK-003',
    slug: 'cookbook-world-cuisines',
    title: 'Cookbook: World Cuisines',
    description: '150 recipes from around the world, with step photos.',
    basePrice: 19.99,
    compareAtPrice: 27.99,
    rating: 4.4,
    ratingCount: 466,
    defaultShippingDays: 5,
    categorySlug: 'books-media',
    images: [img('cookbook-1', 'Cookbook World Cuisines')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BOOK-FINANCE-004',
    slug: 'personal-finance-guide',
    title: 'Personal Finance Guide',
    description: 'A practical, jargon-free guide to budgeting and saving.',
    basePrice: 15.5,
    rating: 4.3,
    ratingCount: 289,
    defaultShippingDays: 4,
    categorySlug: 'books-media',
    images: [img('finance-1', 'Personal Finance Guide')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },
  {
    sku: 'BOOK-SCIFI-005',
    slug: 'sci-fi-anthology',
    title: 'Sci-Fi Short Story Anthology',
    description: 'A collection of award-winning science fiction short stories.',
    basePrice: 13.0,
    rating: 4.5,
    ratingCount: 331,
    defaultShippingDays: 4,
    categorySlug: 'books-media',
    images: [img('scifi-1', 'Sci-Fi Short Story Anthology')],
    countryAvailability: availabilityFor(ALL_SEEDED_COUNTRIES),
  },

  // --- Alcohol & Spirits — restricted in SA/PK via CountryConfig, not code ----
  {
    sku: 'ALCO-WHISKY-001',
    slug: 'craft-whisky-750ml',
    title: 'Craft Single Malt Whisky 750ml',
    description: 'Small-batch single malt whisky, aged 8 years.',
    basePrice: 54.0,
    rating: 4.6,
    ratingCount: 210,
    defaultShippingDays: 6,
    categorySlug: 'alcohol-spirits',
    images: [img('whisky-1', 'Craft Single Malt Whisky')],
    countryAvailability: availabilityFor(ALCOHOL_MARKETS),
  },
  {
    sku: 'ALCO-SPARKLING-002',
    slug: 'sparkling-wine-brut',
    title: 'Sparkling Wine Brut 750ml',
    description: 'A crisp, dry brut sparkling wine.',
    basePrice: 22.0,
    rating: 4.3,
    ratingCount: 156,
    defaultShippingDays: 6,
    categorySlug: 'alcohol-spirits',
    images: [img('sparkling-1', 'Sparkling Wine Brut')],
    countryAvailability: availabilityFor(ALCOHOL_MARKETS),
  },
  {
    sku: 'ALCO-VODKA-003',
    slug: 'premium-vodka-1l',
    title: 'Premium Vodka 1L',
    description: 'Quadruple-distilled premium vodka.',
    basePrice: 28.5,
    rating: 4.4,
    ratingCount: 198,
    defaultShippingDays: 6,
    categorySlug: 'alcohol-spirits',
    images: [img('vodka-1', 'Premium Vodka 1L')],
    countryAvailability: availabilityFor(ALCOHOL_MARKETS),
  },
  {
    sku: 'ALCO-GIN-004',
    slug: 'artisan-gin-700ml',
    title: 'Artisan Botanical Gin 700ml',
    description: 'Small-batch gin with 11 hand-picked botanicals.',
    basePrice: 34.0,
    rating: 4.5,
    ratingCount: 143,
    defaultShippingDays: 6,
    categorySlug: 'alcohol-spirits',
    images: [img('gin-1', 'Artisan Botanical Gin')],
    countryAvailability: availabilityFor(ALCOHOL_MARKETS),
  },
  {
    sku: 'ALCO-RUM-005',
    slug: 'aged-rum-750ml',
    title: 'Aged Dark Rum 750ml',
    description: 'Caribbean dark rum, aged 5 years in oak barrels.',
    basePrice: 31.0,
    rating: 4.6,
    ratingCount: 167,
    defaultShippingDays: 6,
    categorySlug: 'alcohol-spirits',
    images: [img('rum-1', 'Aged Dark Rum')],
    countryAvailability: availabilityFor(ALCOHOL_MARKETS),
  },
];
