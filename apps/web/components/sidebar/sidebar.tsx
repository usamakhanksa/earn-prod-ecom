'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@omnisell/i18n';
import { createTranslator, isRtl } from '@omnisell/i18n';
import { Badge, Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';
import { useConsumerMode } from '@/lib/consumer-mode';
import { LocaleSwitcher } from '../locale-switcher';
import { OrgSwitcher } from './org-switcher';
import { NavGroupSection } from './nav-group';
import { NAV_GROUPS, CONSUMER_NAV_GROUP, SETTINGS_GROUP, FOOTER_LEAVES, DASHBOARD_LEAF } from './nav-data';
import { useBadgeCounts } from './use-badge-counts';
import { handleTreeKeyDown } from './keyboard-tree';

const EXPANDED_WIDTH = 264;
const COLLAPSED_WIDTH = 72;

function storageKey(userId: string | null): string {
  return `omnisell_sidebar_collapsed_${userId ?? 'anon'}`;
}

export function Sidebar({ locale }: { locale: Locale }): React.JSX.Element {
  const { t } = createTranslator(locale);
  const { user, logout } = useSession();
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const badgeCounts = useBadgeCounts();
  const [isConsumerMode, setIsConsumerMode] = useConsumerMode(user?.id ?? null);
  const activeGroups = useMemo(() => (isConsumerMode ? [CONSUMER_NAV_GROUP] : NAV_GROUPS), [isConsumerMode]);

  // Restore persisted collapse state once we know who the user is
  // (featureslist.md §0.1 — "State persisted per user").
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey(user?.id ?? null));
    if (stored !== null) {
      setCollapsed(stored === '1');
    }
  }, [user?.id]);

  useEffect(() => {
    window.localStorage.setItem(storageKey(user?.id ?? null), collapsed ? '1' : '0');
  }, [collapsed, user?.id]);

  // Auto-expand whichever group contains the active route.
  useEffect(() => {
    const active = activeGroups.find((group) => group.items.some((item) => item.href === pathname));
    if (active !== undefined) {
      setExpandedGroups((prev) => new Set(prev).add(active.key));
    }
  }, [pathname, activeGroups]);

  // ⌘/Ctrl+B toggle (featureslist.md §0.1).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setCollapsed((value) => !value);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function toggleGroup(key: string): void {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const dir = isRtl(locale) ? 'rtl' : 'ltr';
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <aside
      dir={dir}
      style={{ width, transition: 'width 180ms var(--ease, ease)' }}
      className="flex h-full shrink-0 flex-col border-e border-border-subtle bg-surface-1"
    >
      <OrgSwitcher locale={locale} />

      {/* Creator ⇄ Consumer mode switcher (docs/points-extension.md §10.1).
          `aria-pressed` reflects Consumer Mode being "on"; label swaps to
          describe the action (what tapping it will switch TO), which is the
          most `aria-pressed`-consistent phrasing for a two-state toggle. */}
      <div className="border-b border-border-subtle p-2">
        <button
          type="button"
          aria-pressed={isConsumerMode}
          aria-label={t('modeSwitch.label')}
          onClick={() => setIsConsumerMode(!isConsumerMode)}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
            isConsumerMode ? 'bg-[var(--consumer-accent)] text-ink-950' : 'bg-surface-2 text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          <span aria-hidden="true">{isConsumerMode ? '◈' : '✦'}</span>
          {!collapsed ? <span>{isConsumerMode ? t('modeSwitch.switchToCreator') : t('modeSwitch.switchToConsumer')}</span> : null}
        </button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- roving-tabindex
          keyboard nav (featureslist.md §0.1): the listener delegates ArrowUp/Down/Home/End from
          whichever focusable button/link inside actually has focus, it doesn't make <nav> itself
          a target — every real interactive element here is still a <button>/<Link>. */}
      <nav
        ref={navRef}
        aria-label={t('nav.mainLabel')}
        className="flex-1 overflow-y-auto p-2"
        onKeyDown={(event) => {
          handleTreeKeyDown(event, navRef.current);
        }}
      >
        <ul className="space-y-0.5">
          <li>
            <Link
              href={isConsumerMode ? '/consumer/wallet' : DASHBOARD_LEAF.href}
              data-nav-item="true"
              aria-current={pathname === (isConsumerMode ? '/consumer/wallet' : DASHBOARD_LEAF.href) ? 'page' : undefined}
              title={collapsed ? t(isConsumerMode ? 'nav.consumerHome' : DASHBOARD_LEAF.labelKey) : undefined}
              className={[
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname === DASHBOARD_LEAF.href
                  ? 'bg-brand-soft text-brand-600'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
              ].join(' ')}
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center">
                ⌂
              </span>
              {!collapsed ? <span className="truncate">{t(isConsumerMode ? 'nav.consumerHome' : DASHBOARD_LEAF.labelKey)}</span> : null}
            </Link>
          </li>

          {activeGroups.map((group) => (
            <NavGroupSection
              key={group.key}
              group={group}
              locale={locale}
              collapsed={collapsed}
              expanded={expandedGroups.has(group.key)}
              onToggle={() => toggleGroup(group.key)}
              badgeCounts={badgeCounts}
            />
          ))}
        </ul>
      </nav>

      <div className="border-t border-border-subtle p-2">
        <ul className="space-y-0.5">
          <NavGroupSection
            group={SETTINGS_GROUP}
            locale={locale}
            collapsed={collapsed}
            expanded={expandedGroups.has(SETTINGS_GROUP.key)}
            onToggle={() => toggleGroup(SETTINGS_GROUP.key)}
            badgeCounts={badgeCounts}
          />
          {FOOTER_LEAVES.map((leaf) => {
            const isActive = leaf.href === pathname;
            const count = leaf.badgeKey !== undefined ? badgeCounts[leaf.badgeKey] : undefined;
            return (
              <li key={leaf.key}>
                <Link
                  href={leaf.href}
                  data-nav-item="true"
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? t(leaf.labelKey) : undefined}
                  className={[
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive ? 'text-brand-600' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                  ].join(' ')}
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">
                    {leaf.key === 'help' ? '⌗' : '◉'}
                  </span>
                  {!collapsed ? <span className="flex-1 truncate">{t(leaf.labelKey)}</span> : null}
                  {count !== undefined && count > 0 ? <Badge tone="brand">{count > 99 ? '99+' : count}</Badge> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle p-3">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        >
          <span aria-hidden="true">{collapsed ? (dir === 'rtl' ? '»' : '«') : dir === 'rtl' ? '«' : '»'}</span>
        </button>
        {!collapsed ? (
          <div className="flex items-center gap-1">
            <LocaleSwitcher current={locale} />
            {user !== null ? (
              <Button variant="ghost" size="sm" onClick={logout}>
                {t('nav.logout')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
