/**
 * Web sidebar tree — verbatim structure from featureslist.md §0.1.
 * `href` targets a real route; sections without a built page in this pass
 * resolve to the `(shell)/[...slug]` "coming soon" catch-all (prompt.md: never
 * render mock data — an honest empty/coming-soon state is the alternative).
 * `badgeKey` slots wire to real counts only (currently just `notifications`);
 * everything else stays unset rather than showing a fabricated number.
 */
export interface NavLeaf {
  key: string;
  labelKey: string;
  href: string;
  badgeKey?: 'notifications';
}

export interface NavGroup {
  key: string;
  labelKey: string;
  icon: string;
  items: NavLeaf[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'studio',
    labelKey: 'nav.studio.title',
    icon: '✦',
    items: [
      { key: 'assets', labelKey: 'nav.studio.assets', href: '/studio/assets' },
      { key: 'collections', labelKey: 'nav.studio.collections', href: '/studio/collections' },
      { key: 'aiStudio', labelKey: 'nav.studio.aiStudio', href: '/studio/ai' },
      { key: 'mockups', labelKey: 'nav.studio.mockups', href: '/studio/mockups' },
      { key: 'preflight', labelKey: 'nav.studio.preflight', href: '/studio/preflight' },
    ],
  },
  {
    key: 'catalog',
    labelKey: 'nav.catalogGroup.title',
    icon: '▤',
    items: [
      { key: 'products', labelKey: 'nav.catalogGroup.products', href: '/catalog/products' },
      { key: 'blueprints', labelKey: 'nav.catalogGroup.blueprints', href: '/catalog/blueprints' },
      { key: 'pricingRules', labelKey: 'nav.catalogGroup.pricingRules', href: '/catalog/pricing-rules' },
      { key: 'bundles', labelKey: 'nav.catalogGroup.bundles', href: '/catalog/bundles' },
    ],
  },
  {
    key: 'channels',
    labelKey: 'nav.channels.title',
    icon: '⇄',
    items: [
      { key: 'connections', labelKey: 'nav.channels.connections', href: '/channels/connections' },
      { key: 'capabilityMatrix', labelKey: 'nav.channels.capabilityMatrix', href: '/channels/capability-matrix' },
      { key: 'syncQueue', labelKey: 'nav.channels.syncQueue', href: '/channels/sync-queue' },
      { key: 'exportPacks', labelKey: 'nav.channels.exportPacks', href: '/channels/export-packs' },
      { key: 'connectionHealth', labelKey: 'nav.channels.connectionHealth', href: '/channels/health' },
    ],
  },
  {
    key: 'listings',
    labelKey: 'nav.listings.title',
    icon: '↗',
    items: [
      { key: 'drafts', labelKey: 'nav.listings.drafts', href: '/listings/drafts' },
      { key: 'pending', labelKey: 'nav.listings.pending', href: '/listings/pending' },
      { key: 'scheduled', labelKey: 'nav.listings.scheduled', href: '/listings/scheduled' },
      { key: 'published', labelKey: 'nav.listings.published', href: '/listings/published' },
      { key: 'rejected', labelKey: 'nav.listings.rejected', href: '/listings/rejected' },
    ],
  },
  {
    key: 'orders',
    labelKey: 'nav.ordersGroup.title',
    icon: '⌸',
    items: [
      { key: 'all', labelKey: 'nav.ordersGroup.all', href: '/orders' },
      { key: 'unfulfilled', labelKey: 'nav.ordersGroup.unfulfilled', href: '/orders/unfulfilled' },
      { key: 'inProduction', labelKey: 'nav.ordersGroup.inProduction', href: '/orders/in-production' },
      { key: 'shipped', labelKey: 'nav.ordersGroup.shipped', href: '/orders/shipped' },
      { key: 'exceptions', labelKey: 'nav.ordersGroup.exceptions', href: '/orders/exceptions' },
      { key: 'returns', labelKey: 'nav.ordersGroup.returns', href: '/orders/returns' },
    ],
  },
  {
    key: 'digital',
    labelKey: 'nav.digital.title',
    icon: '⇩',
    items: [
      { key: 'files', labelKey: 'nav.digital.files', href: '/digital/files' },
      { key: 'licences', labelKey: 'nav.digital.licences', href: '/digital/licences' },
      { key: 'deliveryLog', labelKey: 'nav.digital.deliveryLog', href: '/digital/delivery-log' },
      { key: 'coupons', labelKey: 'nav.digital.coupons', href: '/digital/coupons' },
      { key: 'entitlements', labelKey: 'nav.digital.entitlements', href: '/digital/entitlements' },
    ],
  },
  {
    key: 'gigs',
    labelKey: 'nav.gigs.title',
    icon: '⚒',
    items: [
      { key: 'opportunities', labelKey: 'nav.gigs.opportunities', href: '/gigs/opportunities' },
      { key: 'applications', labelKey: 'nav.gigs.applications', href: '/gigs/applications' },
      { key: 'contracts', labelKey: 'nav.gigs.contracts', href: '/gigs/contracts' },
      { key: 'timeDeliverables', labelKey: 'nav.gigs.timeDeliverables', href: '/gigs/time' },
      { key: 'invoices', labelKey: 'nav.gigs.invoices', href: '/gigs/invoices' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.financeGroup.title',
    icon: '⛁',
    items: [
      { key: 'earnings', labelKey: 'nav.financeGroup.earnings', href: '/finance/earnings' },
      { key: 'payouts', labelKey: 'nav.financeGroup.payouts', href: '/finance/payouts' },
      { key: 'fees', labelKey: 'nav.financeGroup.fees', href: '/finance/fees' },
      { key: 'expenses', labelKey: 'nav.financeGroup.expenses', href: '/finance/expenses' },
      { key: 'ledger', labelKey: 'nav.financeGroup.ledger', href: '/finance/ledger' },
      { key: 'tax', labelKey: 'nav.financeGroup.tax', href: '/finance/tax' },
    ],
  },
  {
    key: 'analytics',
    labelKey: 'nav.analytics.title',
    icon: '◫',
    items: [
      { key: 'overview', labelKey: 'nav.analytics.overview', href: '/analytics/overview' },
      { key: 'channelPnl', labelKey: 'nav.analytics.channelPnl', href: '/analytics/channel-pnl' },
      { key: 'productPerformance', labelKey: 'nav.analytics.productPerformance', href: '/analytics/products' },
      { key: 'traffic', labelKey: 'nav.analytics.traffic', href: '/analytics/traffic' },
      { key: 'trends', labelKey: 'nav.analytics.trends', href: '/analytics/trends' },
      { key: 'customReports', labelKey: 'nav.analytics.customReports', href: '/analytics/reports' },
    ],
  },
  {
    key: 'automations',
    labelKey: 'nav.automations.title',
    icon: '⚙',
    items: [
      { key: 'rules', labelKey: 'nav.automations.rules', href: '/automations/rules' },
      { key: 'schedules', labelKey: 'nav.automations.schedules', href: '/automations/schedules' },
      { key: 'webhooks', labelKey: 'nav.automations.webhooks', href: '/automations/webhooks' },
      { key: 'runHistory', labelKey: 'nav.automations.runHistory', href: '/automations/runs' },
    ],
  },
  {
    key: 'team',
    labelKey: 'nav.team.title',
    icon: '⚑',
    items: [
      { key: 'members', labelKey: 'nav.team.members', href: '/team' },
      { key: 'roles', labelKey: 'nav.team.roles', href: '/team/roles' },
      { key: 'activity', labelKey: 'nav.team.activity', href: '/team/activity' },
    ],
  },
  {
    // Phase 4.5 — Points Economy admin surfaces (docs/points-extension.md
    // §10.3). Tenant RBAC-gated (OWNER/ADMIN manage all; FINANCE updates
    // rules; SUPPORT reviews the fraud queue + adjusts points) — see
    // apps/api/src/rbac/ability.factory.ts. Lives here, not in apps/admin
    // (platform console), because it operates on ONE tenant's own settings.
    key: 'points',
    labelKey: 'nav.pointsGroup.title',
    icon: '⛃',
    items: [
      { key: 'rules', labelKey: 'nav.pointsGroup.rules', href: '/points/rules' },
      { key: 'videos', labelKey: 'nav.pointsGroup.videos', href: '/points/videos' },
      { key: 'fraudQueue', labelKey: 'nav.pointsGroup.fraudQueue', href: '/points/fraud-queue' },
      { key: 'adjust', labelKey: 'nav.pointsGroup.adjust', href: '/points/adjust' },
    ],
  },
];

/**
 * Consumer Mode sidebar tree (docs/points-extension.md §10.2 — "Home /
 * Videos / Shop / Wallet / More"). A separate array (not merged into
 * `NAV_GROUPS`) so the mode switcher can render one or the other rather than
 * both trees at once.
 */
export const CONSUMER_NAV_GROUP: NavGroup = {
  key: 'consumer',
  labelKey: 'modeSwitch.consumer',
  icon: '◈',
  items: [
    { key: 'wallet', labelKey: 'nav.wallet', href: '/consumer/wallet' },
    { key: 'videos', labelKey: 'nav.videos', href: '/consumer/videos' },
    { key: 'shop', labelKey: 'nav.shop', href: '/consumer/shop' },
  ],
};

export const SETTINGS_GROUP: NavGroup = {
  key: 'settings',
  labelKey: 'nav.settingsGroup.title',
  icon: '⛭',
  items: [
    { key: 'profile', labelKey: 'nav.settingsGroup.profile', href: '/settings/profile' },
    { key: 'organisation', labelKey: 'nav.settingsGroup.organisation', href: '/settings/organisation' },
    { key: 'billing', labelKey: 'nav.settingsGroup.billing', href: '/settings/billing' },
    { key: 'notifications', labelKey: 'nav.settingsGroup.notifications', href: '/settings/notifications' },
    { key: 'localisation', labelKey: 'nav.settingsGroup.localisation', href: '/settings/localisation' },
    { key: 'apiKeys', labelKey: 'nav.settingsGroup.apiKeys', href: '/settings/api-keys' },
    { key: 'dangerZone', labelKey: 'nav.settingsGroup.dangerZone', href: '/settings/danger-zone' },
  ],
};

export const FOOTER_LEAVES: NavLeaf[] = [
  { key: 'help', labelKey: 'nav.help', href: '/help' },
  { key: 'whatsNew', labelKey: 'nav.whatsNew', href: '/notifications', badgeKey: 'notifications' },
];

export const DASHBOARD_LEAF: NavLeaf = { key: 'dashboard', labelKey: 'nav.dashboard', href: '/' };
