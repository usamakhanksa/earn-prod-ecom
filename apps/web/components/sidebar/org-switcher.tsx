'use client';

import { useId, useRef, useState } from 'react';
import type { Locale } from '@omnisell/i18n';
import { createTranslator } from '@omnisell/i18n';
import { useSession } from '@/lib/session-context';
import { useClickOutside } from './use-click-outside';

const PLAN_LABEL_KEYS: Record<string, string> = {
  free: 'orgSwitcher.plan.free',
  pro: 'orgSwitcher.plan.pro',
  enterprise: 'orgSwitcher.plan.enterprise',
};

export function OrgSwitcher({ locale }: { locale: Locale }): React.JSX.Element {
  const { t } = createTranslator(locale);
  const { tenants, currentTenant, switchTenant } = useSession();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false));

  const initials = (currentTenant?.name ?? '?').slice(0, 2).toUpperCase();
  const planLabelKey = currentTenant !== null ? PLAN_LABEL_KEYS[currentTenant.plan] : undefined;

  return (
    <div ref={containerRef} className="relative border-b border-border-subtle p-3">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md p-1.5 text-start hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft font-display text-xs font-bold text-brand-600"
        >
          {initials}
        </span>
        <span className="flex-1 overflow-hidden">
          <span className="block truncate text-sm font-medium text-text-primary">
            {currentTenant?.name ?? t('orgSwitcher.noOrg')}
          </span>
          {currentTenant !== null ? (
            <span className="block truncate text-xs text-text-secondary">
              {planLabelKey !== undefined ? t(planLabelKey) : currentTenant.plan}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="text-text-secondary">
          ⌄
        </span>
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-label={t('orgSwitcher.label')}
          className="absolute inset-x-3 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border-subtle bg-surface-1 py-1 shadow-sh2"
        >
          {tenants.map((tenant) => (
            <li key={tenant.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={tenant.id === currentTenant?.id}
                onClick={() => {
                  switchTenant(tenant.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-start text-sm text-text-primary hover:bg-surface-2"
              >
                <span className="truncate">{tenant.name}</span>
                <span className="ms-2 shrink-0 text-xs text-text-secondary">{t(`team.roleLabel.${tenant.role}` as const)}</span>
              </button>
            </li>
          ))}
          {tenants.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-secondary">{t('orgSwitcher.empty')}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
