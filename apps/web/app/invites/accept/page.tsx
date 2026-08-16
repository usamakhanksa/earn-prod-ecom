'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiRequestError } from '@omnisell/api-client';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { Spinner } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

export default function AcceptInvitePage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner label={t('common.loading')} />
        </div>
      }
    >
      <AcceptInviteForm locale={locale} />
    </Suspense>
  );
}

function AcceptInviteForm({ locale }: { locale: Locale }): React.JSX.Element {
  const { t } = createTranslator(locale);
  const { user, isLoading, client, refresh } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<'idle' | 'accepting' | 'accepted' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || user === null || token === null || state !== 'idle') {
      return;
    }
    setState('accepting');
    client
      .post<{ tenantId: string; role: string }>('/invites/accept', { token })
      .then(async () => {
        setState('accepted');
        await refresh();
        router.replace('/');
      })
      .catch((error: unknown) => {
        setState('error');
        setErrorMessage(error instanceof ApiRequestError ? error.message : t('common.error'));
      });
  }, [client, isLoading, refresh, router, state, t, token, user]);

  if (token === null) {
    return <CenteredMessage title={t('invites.accept.missingToken')} />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  if (user === null) {
    const returnTo = encodeURIComponent(`/invites/accept?token=${token}`);
    return (
      <CenteredMessage title={t('invites.accept.needLogin')}>
        <Link href={`/login?returnTo=${returnTo}`} className="text-sm font-medium text-brand-600 hover:underline">
          {t('auth.login.title')}
        </Link>
      </CenteredMessage>
    );
  }

  if (state === 'error') {
    return (
      <CenteredMessage title={t('invites.accept.error')} {...(errorMessage !== null ? { detail: errorMessage } : {})} />
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label={t('invites.accept.working')} />
    </div>
  );
}

function CenteredMessage({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm space-y-2 text-center">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {detail !== undefined ? <p className="text-sm text-text-secondary">{detail}</p> : null}
        {children}
      </div>
    </div>
  );
}
