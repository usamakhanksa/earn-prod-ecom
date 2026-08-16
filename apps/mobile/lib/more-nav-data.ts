/**
 * "More" drawer content (featureslist.md §0.3 — "mirrors the full web sidebar
 * tree"). Reuses the exact same i18n keys as apps/web/components/sidebar/nav-data.ts
 * group titles (the `@omnisell/i18n` package is shared across every app) so the
 * two trees stay in sync by construction rather than by convention. Rows that
 * have a real screen (`href` starting with `/consumer`) navigate there;
 * everything else routes to `/more/[slug]`, the same honest "coming soon" the
 * web catch-all shows.
 */
export interface MoreRow {
  key: string;
  labelKey: string;
  href: string;
}

export interface MoreSection {
  key: string;
  labelKey: string;
  rows: MoreRow[];
}

export const MORE_SECTIONS: MoreSection[] = [
  {
    key: 'consumer',
    labelKey: 'nav.consumerMode',
    rows: [
      { key: 'wallet', labelKey: 'nav.wallet', href: '/consumer/wallet' },
      { key: 'videos', labelKey: 'nav.videos', href: '/consumer/videos' },
      { key: 'shop', labelKey: 'nav.shop', href: '/consumer/shop' },
    ],
  },
  {
    key: 'studio',
    labelKey: 'nav.studio.title',
    rows: [
      { key: 'assets', labelKey: 'nav.studio.assets', href: '/more/studio-assets' },
      { key: 'collections', labelKey: 'nav.studio.collections', href: '/more/studio-collections' },
    ],
  },
  {
    key: 'catalog',
    labelKey: 'nav.catalogGroup.title',
    rows: [{ key: 'products', labelKey: 'nav.catalogGroup.products', href: '/more/catalog-products' }],
  },
  {
    key: 'channels',
    labelKey: 'nav.channels.title',
    rows: [{ key: 'connections', labelKey: 'nav.channels.connections', href: '/more/channels-connections' }],
  },
  {
    key: 'finance',
    labelKey: 'nav.financeGroup.title',
    rows: [{ key: 'earnings', labelKey: 'nav.financeGroup.earnings', href: '/more/finance-earnings' }],
  },
  {
    key: 'team',
    labelKey: 'nav.team.title',
    rows: [{ key: 'members', labelKey: 'nav.team.members', href: '/more/team-members' }],
  },
  {
    key: 'settings',
    labelKey: 'nav.settingsGroup.title',
    rows: [
      { key: 'profile', labelKey: 'nav.settingsGroup.profile', href: '/more/settings-profile' },
      { key: 'localisation', labelKey: 'mobile.more.language', href: '/more/language' },
      { key: 'biometric', labelKey: 'mobile.more.biometric', href: '/more/biometric' },
    ],
  },
];
