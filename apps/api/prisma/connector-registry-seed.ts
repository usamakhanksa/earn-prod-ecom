import { Prisma, type PrismaClient } from '@prisma/client';
import type { ConnectorCapabilities, ConnectorFieldSpec, ConnectorRateLimitConfig } from '@omnisell/shared';

/**
 * Connector registry seed (prompt.md / implentationplanphase.md task 3.1).
 * `ConnectorDefinition` is GLOBAL (see schema.prisma's comment on the model)
 * — this seeds the platform-wide registry once, not per tenant.
 *
 * Three groups of rows:
 *
 * 1. The four real Tier A connectors Phase 3 shipped adapters for
 *    (Printful/Printify/Gelato/Prodigi — packages/connectors's
 *    `ADAPTER_REGISTRY`). Every `apiDocsUrl`/`tosUrl` below was opened live
 *    via WebFetch/WebSearch on 2026-08-11/12 and matches what's documented in
 *    `docs/CONNECTORS.md`. `status: 'BETA'` (not `'ACTIVE'`) is a deliberate,
 *    documented choice: api-registration.md §7's full verification protocol
 *    (a human creates a sandbox account, makes a real authenticated call, and
 *    signs off legally) could NOT be completed in this sandbox — only the
 *    live-docs/ToS/auth-mechanism confirmation could be. `verifiedBy` names
 *    this build pass, not a person, honestly recording that gap rather than
 *    fabricating a human sign-off — see docs/OPEN_QUESTIONS.md.
 *
 * 2. Six more real Tier A connectors added in a bounded follow-up pass on
 *    2026-08-16 (Etsy/Shopify/WooCommerce/Gumroad/Payhip/Sellfy —
 *    `packages/connectors/src/adapters/{etsy,shopify,woocommerce,gumroad,
 *    payhip,sellfy}.ts`), verified live the same way and flagged with the
 *    same honesty standard — see docs/CONNECTORS.md's "Six more adapters"
 *    section for the full per-provider citation trail, including the two
 *    (Payhip/Sellfy) whose write capability api-registration.md §2.3 itself
 *    flagged as uncertain and which were genuinely gated down after live
 *    verification, not left at the generic `AUTOMATABLE` capability set.
 *
 * 3. A SMALL number of Tier C/D rows (Redbubble as Tier C, SunFrog as Tier D)
 *    that exist to give the compile-time Tier-C boundary (task 3.4) and the
 *    admin quarantine screen (task 3.12) something real, non-fabricated to
 *    point at in the running system. Neither has adapter code — Tier C is by
 *    definition never automated, so it never gets one — SunFrog stays
 *    `UNVERIFIED`/hidden (Tier D quarantine, unchanged from Phase 3).
 *    Redbubble was PROMOTED in Phase 4 from "boundary-proof only" to
 *    `status: 'BETA'`, a real, visible Tier C row with a sourced `fieldSpec`
 *    — see the doc comment on the Redbubble row below — because Phase 4's
 *    own exit criterion is "a Redbubble Export Pack a user can actually
 *    follow to upload manually", which needs a real fieldSpec to size print
 *    files against. Wave-2/Tier B/D lists from featureslist.md §16 remain
 *    OUT of scope.
 */

interface SeedRow {
  slug: string;
  name: string;
  category: string;
  tier: 'A' | 'B' | 'C' | 'D';
  status: 'ACTIVE' | 'BETA' | 'GATED' | 'UNVERIFIED' | 'RETIRED';
  authType: 'OAUTH2_PKCE' | 'OAUTH2' | 'API_KEY' | 'PAT' | 'NONE';
  apiDocsUrl: string | null;
  tosUrl: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  requiresPartnerApproval: boolean;
  rateLimit: ConnectorRateLimitConfig;
  capabilities: ConnectorCapabilities;
  fieldSpec: ConnectorFieldSpec | null;
}

const VERIFIED_AT = new Date('2026-08-11T00:00:00.000Z');
const VERIFIED_BY = 'OmniSell Phase 3 build pass (automated live-docs verification — see docs/CONNECTORS.md; human sandbox-call + legal sign-off per api-registration.md §7 still pending)';

/** Six-more-adapters follow-up pass (Etsy/Shopify/WooCommerce/Gumroad/
 * Payhip/Sellfy) — same honest pattern as `VERIFIED_AT`/`VERIFIED_BY` above,
 * dated separately since it happened in a later, bounded pass, not Phase 3
 * itself. See docs/CONNECTORS.md's "Six more adapters" section. */
const VERIFIED_AT_FOLLOWUP = new Date('2026-08-16T00:00:00.000Z');
const VERIFIED_BY_FOLLOWUP = 'OmniSell six-adapters follow-up pass (automated live-docs verification — see docs/CONNECTORS.md; human sandbox-call + legal sign-off per api-registration.md §7 still pending)';

const AUTOMATABLE: ConnectorCapabilities = {
  canAutomate: true,
  canPublish: true,
  canUpdate: true,
  canUnpublish: true,
  canSyncOrders: true,
  canFulfil: true,
  canFetchCost: true,
  canFetchEarnings: false,
  supportsWebhooks: true,
  supportsSandbox: false,
  ordersMechanism: 'webhook',
};

const SEED_ROWS: SeedRow[] = [
  {
    slug: 'printful',
    name: 'Printful',
    category: 'POD',
    tier: 'A',
    status: 'BETA',
    authType: 'OAUTH2',
    apiDocsUrl: 'https://developers.printful.com/docs/',
    tosUrl: 'https://www.printful.com/policies/terms-of-service',
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    requiresPartnerApproval: false,
    rateLimit: { requests: 120, windowMs: 60_000, burst: 20 },
    capabilities: { ...AUTOMATABLE, canFetchEarnings: false },
    fieldSpec: {
      maxTitle: 200,
      maxDescription: 5000,
      maxTags: 13,
      imageSpecs: [{ placement: 'front', minWidthPx: 1800, minHeightPx: 2400, dpiMin: 150, formats: ['png', 'jpg'] }],
    },
  },
  {
    slug: 'printify',
    name: 'Printify',
    category: 'POD',
    tier: 'A',
    status: 'BETA',
    authType: 'PAT',
    apiDocsUrl: 'https://developers.printify.com/',
    tosUrl: 'https://printify.com/terms-of-service/',
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    requiresPartnerApproval: false,
    rateLimit: { requests: 100, windowMs: 60_000, burst: 20 },
    capabilities: AUTOMATABLE,
    fieldSpec: {
      maxTitle: 255,
      maxDescription: 100_000,
      maxTags: 20,
      imageSpecs: [{ placement: 'front', minWidthPx: 1000, minHeightPx: 1000, dpiMin: 100, formats: ['png', 'jpg'] }],
    },
  },
  {
    slug: 'gelato',
    name: 'Gelato',
    category: 'POD',
    tier: 'A',
    status: 'BETA',
    authType: 'API_KEY',
    apiDocsUrl: 'https://dashboard.gelato.com/docs/',
    tosUrl: 'https://www.gelato.com/legal/api-terms',
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    requiresPartnerApproval: false,
    rateLimit: { requests: 60, windowMs: 60_000, burst: 10 },
    capabilities: AUTOMATABLE,
    fieldSpec: {
      maxTitle: 255,
      maxDescription: 20_000,
      maxTags: 20,
      imageSpecs: [{ placement: 'front', minWidthPx: 1000, minHeightPx: 1000, dpiMin: 150, formats: ['png', 'jpg', 'pdf'] }],
    },
  },
  {
    slug: 'prodigi',
    name: 'Prodigi',
    category: 'POD',
    tier: 'A',
    status: 'BETA',
    authType: 'API_KEY',
    apiDocsUrl: 'https://www.prodigi.com/print-api/docs/reference/',
    tosUrl: 'https://www.prodigi.com/terms-of-use/',
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    requiresPartnerApproval: false,
    rateLimit: { requests: 60, windowMs: 60_000, burst: 10 },
    capabilities: { ...AUTOMATABLE, canPublish: false, canUpdate: false, canUnpublish: false, supportsSandbox: true },
    fieldSpec: {
      maxTitle: 200,
      maxDescription: 5000,
      maxTags: 0,
      imageSpecs: [{ placement: 'default', minWidthPx: 1500, minHeightPx: 1500, dpiMin: 300, formats: ['jpg', 'png', 'tiff'] }],
    },
  },
  // --- Six more Tier A adapters, added in a bounded follow-up pass (not a
  // full phase) after the original four. Each was verified live this pass
  // via WebFetch/WebSearch against its own real developer-docs domain — see
  // docs/CONNECTORS.md's "Six more adapters" section for the full per-
  // provider citation trail and every flagged uncertainty. `status: 'BETA'`
  // for the same reason as the original four (docs/CONNECTORS.md's "Why
  // status: 'BETA'" section): live docs/ToS/auth confirmed, but no real
  // sandbox account, no real authenticated call, and no human legal sign-off
  // exist in this sandbox. `verifiedBy` names this build pass, not a person,
  // for the same honest reason the original four do.
  {
    slug: 'etsy',
    name: 'Etsy',
    category: 'ECOM',
    tier: 'A',
    status: 'BETA',
    authType: 'OAUTH2_PKCE',
    apiDocsUrl: 'https://developers.etsy.com/documentation/',
    tosUrl: 'https://www.etsy.com/legal/api/',
    verifiedAt: VERIFIED_AT_FOLLOWUP,
    verifiedBy: VERIFIED_BY_FOLLOWUP,
    requiresPartnerApproval: true, // production access needs Etsy's own app review — not self-serve (see adapter doc comment)
    rateLimit: { requests: 10, windowMs: 1_000, burst: 10 }, // CONFIRMED: developer.etsy.com/documentation/essentials/rate-limits/ (10 req/s, 10,000/day)
    capabilities: { ...AUTOMATABLE, canFetchCost: false, canFetchEarnings: false, supportsWebhooks: false, ordersMechanism: 'poll' },
    fieldSpec: {
      maxTitle: 140,
      maxDescription: 100_000,
      maxTags: 13, // CONFIRMED — Etsy's long-documented 13-tag cap
      imageSpecs: [{ placement: 'default', minWidthPx: 2000, minHeightPx: 2000, dpiMin: 72, formats: ['png', 'jpg'] }],
    },
  },
  {
    slug: 'shopify',
    name: 'Shopify',
    category: 'ECOM',
    tier: 'A',
    status: 'BETA',
    authType: 'API_KEY', // custom-app Admin API access token — see adapter doc comment for why OAuth public-app was NOT chosen
    apiDocsUrl: 'https://shopify.dev/docs/api/admin-graphql',
    tosUrl: 'https://www.shopify.com/legal/api-terms',
    verifiedAt: VERIFIED_AT_FOLLOWUP,
    verifiedBy: VERIFIED_BY_FOLLOWUP,
    requiresPartnerApproval: false, // custom-app token path is self-serve in the merchant's own admin (no App Store review)
    rateLimit: { requests: 2, windowMs: 1_000, burst: 40 }, // APPROXIMATION of Shopify's real cost-based GraphQL bucket — not a literal published req/s figure, see adapter doc comment
    capabilities: AUTOMATABLE,
    fieldSpec: {
      maxTitle: 255,
      maxDescription: 65_535,
      maxTags: 250,
      imageSpecs: [{ placement: 'default', minWidthPx: 800, minHeightPx: 800, dpiMin: 72, formats: ['png', 'jpg', 'webp'] }],
    },
  },
  {
    slug: 'woocommerce',
    name: 'WooCommerce',
    category: 'ECOM',
    tier: 'A',
    status: 'BETA',
    // `AuthType` (this registry's connection-flow enum) has no dedicated HMAC
    // option — `'API_KEY'` is the closest fit for "user pastes a key pair,
    // OmniSell makes a live test call" (api-registration.md §1's table).
    // The credential itself is stored as `CREDENTIAL_KINDS.HMAC_PAIR` (the
    // consumer key/secret pair), a distinct, narrower enum — see
    // `packages/shared/src/enums.ts`.
    authType: 'API_KEY',
    apiDocsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
    tosUrl: 'https://woocommerce.com/terms-conditions/',
    verifiedAt: VERIFIED_AT_FOLLOWUP,
    verifiedBy: VERIFIED_BY_FOLLOWUP,
    requiresPartnerApproval: false,
    rateLimit: { requests: 60, windowMs: 60_000, burst: 10 }, // OmniSell's own self-imposed default — WooCommerce is self-hosted, no platform-wide limit to confirm (see adapter doc comment)
    capabilities: { ...AUTOMATABLE, canFulfil: false, canFetchCost: false, canFetchEarnings: false },
    fieldSpec: {
      maxTitle: 255,
      maxDescription: 65_535,
      maxTags: 0, // no documented tag cap in WooCommerce core
      imageSpecs: [{ placement: 'default', minWidthPx: 800, minHeightPx: 800, dpiMin: 72, formats: ['png', 'jpg'] }],
    },
  },
  {
    slug: 'gumroad',
    name: 'Gumroad',
    category: 'DIGITAL',
    tier: 'A',
    status: 'BETA',
    authType: 'OAUTH2',
    apiDocsUrl: 'https://help.gumroad.com/docs/api/01-overview',
    tosUrl: 'https://gumroad.com/terms',
    verifiedAt: VERIFIED_AT_FOLLOWUP,
    verifiedBy: VERIFIED_BY_FOLLOWUP,
    requiresPartnerApproval: false,
    rateLimit: { requests: 60, windowMs: 60_000, burst: 10 }, // conservative estimate — no numeric published limit found this pass
    capabilities: { ...AUTOMATABLE, canFetchCost: false, canFetchEarnings: false },
    fieldSpec: {
      maxTitle: 255,
      maxDescription: 100_000,
      maxTags: 0,
      imageSpecs: [{ placement: 'cover', minWidthPx: 1280, minHeightPx: 720, dpiMin: 72, formats: ['png', 'jpg'] }],
    },
  },
  // Payhip and Sellfy are the two connectors api-registration.md §2.3 itself
  // flags as uncertain ("Confirm write capability; may be read/reporting-
  // oriented" / "Verify current API availability"). Both were genuinely
  // gated down after live verification — see docs/CONNECTORS.md and each
  // adapter's own doc comment for the full reasoning; NEITHER capabilities
  // row below is the generic `AUTOMATABLE` constant.
  {
    slug: 'payhip',
    name: 'Payhip',
    category: 'DIGITAL',
    tier: 'A',
    status: 'BETA',
    authType: 'API_KEY',
    apiDocsUrl: 'https://payhip.com/api-reference',
    tosUrl: 'https://payhip.com/terms',
    verifiedAt: VERIFIED_AT_FOLLOWUP,
    verifiedBy: VERIFIED_BY_FOLLOWUP,
    requiresPartnerApproval: false,
    rateLimit: { requests: 60, windowMs: 60_000, burst: 10 },
    capabilities: {
      canAutomate: true,
      canPublish: false,
      canUpdate: false,
      canUnpublish: false,
      canSyncOrders: false,
      canFulfil: false,
      canFetchCost: false,
      canFetchEarnings: false,
      supportsWebhooks: true,
      supportsSandbox: false,
      ordersMechanism: 'webhook',
    },
    fieldSpec: {
      maxTitle: 0, // no product-listing endpoint exists to size a title against — see adapter doc comment
      maxDescription: 0,
      maxTags: 0,
      imageSpecs: [],
    },
  },
  {
    slug: 'sellfy',
    name: 'Sellfy',
    category: 'DIGITAL',
    tier: 'A',
    status: 'BETA',
    authType: 'API_KEY',
    apiDocsUrl: 'https://docs.sellfy.com/',
    tosUrl: 'https://sellfy.com/terms/',
    verifiedAt: VERIFIED_AT_FOLLOWUP,
    verifiedBy: VERIFIED_BY_FOLLOWUP,
    requiresPartnerApproval: false,
    rateLimit: { requests: 0, windowMs: 60_000, burst: 0 }, // nominal — no REST API to rate-limit against was found (webhook-delivery path only), see adapter doc comment
    capabilities: {
      canAutomate: true,
      canPublish: false,
      canUpdate: false,
      canUnpublish: false,
      canSyncOrders: true, // via the confirmed "New order" webhook only
      canFulfil: false,
      canFetchCost: false,
      canFetchEarnings: false,
      supportsWebhooks: true,
      supportsSandbox: false,
      ordersMechanism: 'webhook',
    },
    fieldSpec: {
      maxTitle: 0, // no product-listing endpoint exists to size a title against — see adapter doc comment
      maxDescription: 0,
      maxTags: 0,
      imageSpecs: [],
    },
  },
  // --- Tier C: Redbubble — promoted from "boundary-proof only" (Phase 3) to a
  // real, usable Export Pack channel this pass (Phase 4 task 4.12 / exit
  // criterion: "a Redbubble Export Pack a user can actually follow to upload
  // manually"). `status: 'BETA'` mirrors the same honest standard the four
  // Tier A adapters use (docs/OPEN_QUESTIONS.md #23) — visible to users, but
  // short of a human sign-off. `fieldSpec`/`tosUrl` numbers below were
  // confirmed via WebSearch on 2026-08-12 against Redbubble's own published
  // guidance (docs/CONNECTORS.md has the full citation trail):
  //  - Tag limit: exactly 15 tags, 50 chars each — Redbubble's own July 2023
  //    "new tagging limits" announcement (blog.redbubble.com).
  //  - Max upload size: 13,500 x 13,500px / 300MB — Redbubble's help-center-
  //    sourced guidance (aggregated via topbubbleindex.com/icons8.com, since
  //    the help.redbubble.com page itself 403'd this pass's WebFetch).
  //  - Per-product minimums vary (e.g. art prints >= 3840x3840px); this
  //    fieldSpec's `imageSpecs` entry uses that figure as a reasonable
  //    single "safe for most products" floor, NOT a per-product exact table —
  //    flagged here rather than fabricating per-product precision.
  //  - Title/description exact official character caps were NOT found in any
  //    source this pass — `maxTitle`/`maxDescription` below are conservative
  //    ESTIMATES (same honest-estimate pattern as 3-D7's rate limits), not a
  //    confirmed platform rule.
  {
    slug: 'redbubble',
    name: 'Redbubble',
    category: 'POD',
    tier: 'C',
    status: 'BETA',
    authType: 'NONE',
    apiDocsUrl: null, // no write API exists — Tier C by definition (brb.md §6)
    tosUrl: 'https://www.redbubble.com/legal/terms-of-service',
    verifiedAt: null,
    verifiedBy: null,
    requiresPartnerApproval: false,
    rateLimit: { requests: 0, windowMs: 60_000, burst: 0 },
    capabilities: {
      canAutomate: false,
      canPublish: false,
      canUpdate: false,
      canUnpublish: false,
      canSyncOrders: false,
      canFulfil: false,
      canFetchCost: false,
      canFetchEarnings: false,
      supportsWebhooks: false,
      supportsSandbox: false,
      ordersMechanism: 'none',
    },
    fieldSpec: {
      maxTitle: 120, // ESTIMATE — no official cap confirmed (see comment above)
      maxDescription: 1000, // ESTIMATE — no official cap confirmed
      maxTags: 15, // CONFIRMED — Redbubble's own July 2023 tagging-limits announcement
      imageSpecs: [{ placement: 'default', minWidthPx: 3840, minHeightPx: 3840, dpiMin: 150, formats: ['png', 'jpeg'] }],
    },
  },
  {
    slug: 'sunfrog',
    name: 'SunFrog',
    category: 'POD',
    tier: 'D',
    status: 'UNVERIFIED', // dead/unverifiable per api-registration.md §5 — quarantined, never shown to users
    authType: 'NONE',
    apiDocsUrl: null,
    tosUrl: null,
    verifiedAt: null,
    verifiedBy: null,
    requiresPartnerApproval: false,
    rateLimit: { requests: 0, windowMs: 60_000, burst: 0 },
    capabilities: {
      canAutomate: false,
      canPublish: false,
      canUpdate: false,
      canUnpublish: false,
      canSyncOrders: false,
      canFulfil: false,
      canFetchCost: false,
      canFetchEarnings: false,
      supportsWebhooks: false,
      supportsSandbox: false,
      ordersMechanism: 'none',
    },
    fieldSpec: null,
  },
];

export async function seedConnectorRegistry(prisma: PrismaClient): Promise<void> {
  for (const row of SEED_ROWS) {
    const rateLimit = row.rateLimit as unknown as Prisma.InputJsonValue;
    const capabilities = row.capabilities as unknown as Prisma.InputJsonValue;
    const fieldSpec: Prisma.InputJsonValue | typeof Prisma.JsonNull = row.fieldSpec === null ? Prisma.JsonNull : (row.fieldSpec as unknown as Prisma.InputJsonValue);

    const definition = await prisma.connectorDefinition.upsert({
      where: { slug: row.slug },
      update: {
        name: row.name,
        category: row.category,
        tier: row.tier,
        status: row.status,
        authType: row.authType,
        apiDocsUrl: row.apiDocsUrl,
        tosUrl: row.tosUrl,
        verifiedAt: row.verifiedAt,
        verifiedBy: row.verifiedBy,
        requiresPartnerApproval: row.requiresPartnerApproval,
        rateLimit,
        capabilities,
        fieldSpec,
      },
      create: {
        slug: row.slug,
        name: row.name,
        category: row.category,
        tier: row.tier,
        status: row.status,
        authType: row.authType,
        apiDocsUrl: row.apiDocsUrl,
        tosUrl: row.tosUrl,
        verifiedAt: row.verifiedAt,
        verifiedBy: row.verifiedBy,
        requiresPartnerApproval: row.requiresPartnerApproval,
        rateLimit,
        capabilities,
        fieldSpec,
      },
    });

    await prisma.connectorVersion.upsert({
      where: { connectorId_version: { connectorId: definition.id, version: '1.0.0' } },
      update: {},
      create: { connectorId: definition.id, version: '1.0.0', releaseNotes: 'Phase 3 initial adapter', isCurrent: true },
    });
  }
}
