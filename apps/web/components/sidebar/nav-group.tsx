'use client';

import { useId } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@omnisell/i18n';
import { createTranslator } from '@omnisell/i18n';
import { Badge } from '@omnisell/ui';
import type { NavGroup } from './nav-data';

export function NavGroupSection({
  group,
  locale,
  collapsed,
  expanded,
  onToggle,
  badgeCounts,
}: {
  group: NavGroup;
  locale: Locale;
  /** Icon-rail mode — the whole tree collapses to icons; groups can't expand. */
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  badgeCounts: Partial<Record<string, number>>;
}): React.JSX.Element {
  const { t } = createTranslator(locale);
  const pathname = usePathname();
  const panelId = useId();
  const isActiveGroup = group.items.some((item) => item.href === pathname);

  return (
    <li>
      <button
        type="button"
        data-nav-item="true"
        aria-expanded={collapsed ? undefined : expanded}
        aria-controls={collapsed ? undefined : panelId}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (collapsed) {
            return;
          }
          if (event.key === 'ArrowRight' && !expanded) {
            event.preventDefault();
            onToggle();
          } else if (event.key === 'ArrowLeft' && expanded) {
            event.preventDefault();
            onToggle();
          }
        }}
        title={collapsed ? t(group.labelKey) : undefined}
        className={[
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-medium transition-colors',
          isActiveGroup ? 'text-brand-600' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
        ].join(' ')}
      >
        <span aria-hidden="true" className="w-4 shrink-0 text-center">
          {group.icon}
        </span>
        {!collapsed ? (
          <>
            <span className="flex-1 truncate">{t(group.labelKey)}</span>
            <span aria-hidden="true" className={`text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}>
              ⌄
            </span>
          </>
        ) : null}
      </button>

      {!collapsed && expanded ? (
        <ul id={panelId} className="ms-3 space-y-0.5 border-s border-border-subtle ps-3 py-0.5">
          {group.items.map((item) => {
            const isActive = item.href === pathname;
            const badgeCount = item.badgeKey !== undefined ? badgeCounts[item.badgeKey] : undefined;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  data-nav-item="true"
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-soft text-brand-600'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                  ].join(' ')}
                >
                  <span className="truncate">{t(item.labelKey)}</span>
                  {badgeCount !== undefined && badgeCount > 0 ? (
                    <Badge tone="brand">{badgeCount > 99 ? '99+' : badgeCount}</Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
