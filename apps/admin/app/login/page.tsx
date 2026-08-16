'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '@omnisell/api-client';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { Button } from '@omnisell/ui';
import { useAdminSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

export default function AdminLoginPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { login, user, isLoading } = useAdminSession();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user !== null) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('admin.login.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-0 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-1 p-6 shadow-sh2">
        <h1 className="font-display text-lg font-bold text-text-primary">{t('admin.login.title')}</h1>
        <p className="mt-1 text-xs text-text-secondary">{t('admin.login.subtitle')}</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label htmlFor="email" className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('auth.email')}</span>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label htmlFor="password" className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('auth.password')}</span>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
          </label>
          {error !== null ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="danger" loading={submitting} className="w-full">
            {t('admin.login.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
