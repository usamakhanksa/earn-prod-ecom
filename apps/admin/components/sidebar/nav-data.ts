/** Admin sidebar — verbatim structure from featureslist.md §0.2. A flat list
 * (no sub-groups, unlike the tenant-app sidebar). Only Command Centre and
 * Feature Flags & Config have real screens in this pass — everything else
 * resolves to the `(shell)/[...slug]` "coming soon" catch-all. */
export interface AdminNavItem {
  key: string;
  labelKey: string;
  icon: string;
  href: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: 'commandCentre', labelKey: 'admin.nav.commandCentre', icon: '⌁', href: '/' },
  { key: 'tenants', labelKey: 'admin.nav.tenants', icon: '⌸', href: '/tenants' },
  { key: 'usersAccess', labelKey: 'admin.nav.usersAccess', icon: '⚑', href: '/users' },
  { key: 'connectorRegistry', labelKey: 'admin.nav.connectorRegistry', icon: '⇄', href: '/connectors' },
  { key: 'jobsQueues', labelKey: 'admin.nav.jobsQueues', icon: '⟳', href: '/jobs' },
  { key: 'moderation', labelKey: 'admin.nav.moderation', icon: '⚖', href: '/moderation' },
  { key: 'billingPlans', labelKey: 'admin.nav.billingPlans', icon: '⛁', href: '/billing' },
  { key: 'financeOps', labelKey: 'admin.nav.financeOps', icon: '⛃', href: '/finance-ops' },
  { key: 'supportDesk', labelKey: 'admin.nav.supportDesk', icon: '⌨', href: '/support' },
  { key: 'featureFlags', labelKey: 'admin.nav.featureFlags', icon: '⚐', href: '/flags' },
  { key: 'announcements', labelKey: 'admin.nav.announcements', icon: '◈', href: '/announcements' },
  { key: 'auditLog', labelKey: 'admin.nav.auditLog', icon: '⌗', href: '/audit-log' },
  { key: 'observability', labelKey: 'admin.nav.observability', icon: '◫', href: '/observability' },
  { key: 'dataTools', labelKey: 'admin.nav.dataTools', icon: '⛘', href: '/data-tools' },
  { key: 'systemSettings', labelKey: 'admin.nav.systemSettings', icon: '⛭', href: '/system-settings' },
];
