'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@omnisell/i18n';
import { createTranslator, isRtl } from '@omnisell/i18n';
import { Button } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';
import { LocaleSwitcher } from '../locale-switcher';
import { ADMIN_NAV_ITEMS } from './nav-data';

/**
 * Admin sidebar (prompt.md Phase 1.8 / featureslist.md §0.2) — distinct dark
 * chrome + red accent via `[data-shell='admin']` CSS variable overrides in
 * `admin-globals.css` (Phase 0), NOT a separate visual identity coded here.
 * Flat nav (no collapsible groups) per §0.2's own structure; keyboard
 * operability comes for free from real `<Link>`/`<button>` elements in tab
 * order — no custom roving-tabindex tree is needed for a flat list.
 */
export function AdminSidebar({ locale }: { locale: Locale }): React.JSX.Element {
  const { t } = createTranslator(locale);
  const { user, logout } = useAdminSession();
  const pathname = usePathname();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <aside dir={dir} className="flex h-full w-64 shrink-0 flex-col border-e border-border-subtle bg-surface-1">
      <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
        <span aria-hidden="true" className="text-brand-500">
          ⌁
        </span>
        <span className="font-display text-sm font-bold tracking-tight text-brand-500">
          {t('admin.shellName')}
        </span>
      </div>

      <nav aria-label={t('admin.nav.label')} className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = item.href === pathname;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-brand-soft text-brand-500' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                  ].join(' ')}
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">
                    {item.icon}
                  </span>
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border-subtle p-3">
        <p className="truncate text-xs text-text-secondary">{user?.email}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <LocaleSwitcher current={locale} />
          <Button variant="ghost" size="sm" onClick={logout}>
            {t('admin.logout')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
