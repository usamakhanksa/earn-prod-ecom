'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@omnisell/i18n';
import { createTranslator } from '@omnisell/i18n';
import { Spinner } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

export function AdminAuthGuard({ locale, children }: { locale: Locale; children: React.ReactNode }): React.JSX.Element | null {
  const { isLoading, user } = useAdminSession();
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
    return null;
  }

  return <>{children}</>;
}
