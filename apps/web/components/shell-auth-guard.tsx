'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@omnisell/i18n';
import { createTranslator } from '@omnisell/i18n';
import { Spinner } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

/** Gate for every route under `app/(shell)` — redirects to `/login` once we
 * know for certain there is no session (prompt.md Phase 1.7/1.8 app shell). */
export function ShellAuthGuard({ locale, children }: { locale: Locale; children: React.ReactNode }): React.JSX.Element | null {
  const { isLoading, user } = useSession();
  const router = useRouter();
  const { t } = createTranslator(locale);

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  if (user === null) {
    return null; // redirecting
  }

  return <>{children}</>;
}
