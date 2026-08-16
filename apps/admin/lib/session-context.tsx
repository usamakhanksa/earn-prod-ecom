'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiRequestError, type OmniSellClient } from '@omnisell/api-client';
import { createApiClient, createAnonymousApiClient } from './api-client';
import { readSession, writeSession, type StoredSession } from './session-storage';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  emailVerifiedAt: string | null;
  isPlatformAdmin: boolean;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Admin session context (prompt.md Phase 1.8 / featureslist.md §0.2).
 *
 * Deliberately its OWN provider/module, not a re-export of `apps/web`'s —
 * the two apps do not share a build target, and the admin guard has an extra
 * check web's never needs: `isPlatformAdmin`. A tenant OWNER/ADMIN can log in
 * successfully against `/v1/auth/login` (it's the same JWT session as the
 * tenant apps, per prompt.md Phase 1.8 — "reuse JWT sessions with an
 * admin-role check") but is immediately signed back out here with a clear
 * "not a platform admin" message rather than ever reaching admin screens.
 */
interface AdminSessionContextValue {
  isLoading: boolean;
  user: AdminUser | null;
  client: OmniSellClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

function isExpired(session: StoredSession): boolean {
  return session.expiresAt <= Date.now();
}

export function AdminSessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);

  const client = useMemo(() => createApiClient(session?.accessToken), [session?.accessToken]);

  const persist = useCallback((next: StoredSession | null) => {
    writeSession(next);
    setSession(next);
  }, []);

  const loadProfile = useCallback(async (activeClient: OmniSellClient): Promise<AdminUser> => {
    const me = await activeClient.get<AdminUser>('/auth/me');
    if (!me.isPlatformAdmin) {
      throw new ApiRequestError('This account is not a platform admin.', { status: 403, code: 'not_platform_admin' });
    }
    return me;
  }, []);

  useEffect(() => {
    const stored = readSession();
    if (stored === null || isExpired(stored)) {
      writeSession(null);
      setIsLoading(false);
      return;
    }
    setSession(stored);
    loadProfile(createApiClient(stored.accessToken))
      .then(setUser)
      .catch(() => {
        writeSession(null);
        setSession(null);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const anon = createAnonymousApiClient();
      const result = await anon.post<AuthTokens | { mfaRequired: true }>('/auth/login', { email, password });
      if ('mfaRequired' in result) {
        throw new ApiRequestError(
          'MFA-protected accounts are not yet supported on the admin console.',
          { status: 501, code: 'admin_mfa_unsupported' },
        );
      }
      const bound = createApiClient(result.accessToken);
      const me = await loadProfile(bound); // throws + never persists if not a platform admin
      persist({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: Date.now() + result.expiresIn * 1000 });
      setUser(me);
    },
    [loadProfile, persist],
  );

  const logout = useCallback(() => {
    persist(null);
    setUser(null);
  }, [persist]);

  const value: AdminSessionContextValue = { isLoading, user, client, login, logout };
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionContextValue {
  const ctx = useContext(AdminSessionContext);
  if (ctx === null) {
    throw new Error('useAdminSession must be used within an AdminSessionProvider');
  }
  return ctx;
}
