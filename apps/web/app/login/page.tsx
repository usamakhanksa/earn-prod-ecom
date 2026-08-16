'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiRequestError } from '@omnisell/api-client';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { Button, Spinner } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

type Mode = 'login' | 'register' | 'mfa';

// `useSearchParams()` requires a Suspense boundary (Next.js App Router) so the
// route can still be statically shelled — the actual form is the inner component.
// Locale is resolved here (not inside the suspended child) purely so the
// fallback spinner's label can still be translated instead of hardcoded.
export default function LoginPage(): React.JSX.Element {
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
      <LoginForm locale={locale} />
    </Suspense>
  );
}

function LoginForm({ locale }: { locale: Locale }): React.JSX.Element {
  const { t } = createTranslator(locale);
  const { login, register, completeMfaChallenge, user, isLoading } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const destination = returnTo !== null && returnTo.startsWith('/') ? returnTo : '/';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user !== null) {
      router.replace(destination);
    }
  }, [isLoading, user, router, destination]);

  async function handleLogin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await login(email, password);
      if (outcome.status === 'mfa_required') {
        setChallengeToken(outcome.challengeToken);
        setMode('mfa');
      } else {
        router.replace(destination);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.error.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ email, password, orgName, ...(name.length > 0 ? { name } : {}) });
      router.replace(destination);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.error.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (challengeToken === null) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await completeMfaChallenge(challengeToken, mfaCode);
      router.replace(destination);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.error.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-0 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-1 p-6 shadow-sh2">
        <h1 className="font-display text-lg font-bold text-text-primary">
          {mode === 'mfa' ? t('auth.mfa.title') : mode === 'register' ? t('auth.register.title') : t('auth.login.title')}
        </h1>

        {mode === 'mfa' ? (
          <form onSubmit={handleMfaSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-text-secondary">{t('auth.mfa.body')}</p>
            <Field label={t('auth.mfa.code')} htmlFor="mfa-code">
              <input
                id="mfa-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
              />
            </Field>
            {error !== null ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" loading={submitting} className="w-full">
              {t('auth.mfa.submit')}
            </Button>
          </form>
        ) : (
          <form onSubmit={mode === 'register' ? handleRegister : handleLogin} className="mt-4 space-y-4">
            <Field label={t('auth.email')} htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
              />
            </Field>
            <Field label={t('auth.password')} htmlFor="password">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
              />
            </Field>
            {mode === 'register' ? (
              <>
                <Field label={t('auth.name')} htmlFor="name">
                  <input
                    id="name"
                    name="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
                  />
                </Field>
                <Field label={t('auth.orgName')} htmlFor="orgName">
                  <input
                    id="orgName"
                    name="orgName"
                    required
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
                  />
                </Field>
              </>
            ) : null}
            {error !== null ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" loading={submitting} className="w-full">
              {mode === 'register' ? t('auth.register.submit') : t('auth.login.submit')}
            </Button>
          </form>
        )}

        {mode !== 'mfa' ? (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError(null);
            }}
            className="mt-4 text-sm text-brand-600 hover:underline"
          >
            {mode === 'register' ? t('auth.switchToLogin') : t('auth.switchToRegister')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label htmlFor={htmlFor} className="block text-sm">
      <span className="mb-1 block font-medium text-text-primary">{label}</span>
      {children}
    </label>
  );
}
