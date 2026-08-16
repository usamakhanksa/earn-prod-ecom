'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiRequestError, type OmniSellClient } from '@omnisell/api-client';
import type { TenantSummary } from '@omnisell/shared';
import { createApiClient, createAnonymousApiClient } from './api-client';
import { readSession, writeSession, type StoredSession } from './session-storage';

export interface AuthedUser {
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

type LoginOutcome = { status: 'authenticated' } | { status: 'mfa_required'; challengeToken: string };

interface SessionContextValue {
  isLoading: boolean;
  user: AuthedUser | null;
  tenants: TenantSummary[];
  currentTenantId: string | null;
  currentTenant: TenantSummary | null;
  /** Bound to the current token + selected tenant — every authenticated call
   * in the app should go through this instance. */
  client: OmniSellClient;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeMfaChallenge: (challengeToken: string, code: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string; orgName: string }) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function isExpired(session: StoredSession): boolean {
  return session.expiresAt <= Date.now();
}

export function SessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [session, setSession] = useState<StoredSession | null>(null);

  const client = useMemo(
    () => createApiClient(session?.accessToken, session?.tenantId),
    [session?.accessToken, session?.tenantId],
  );

  const persist = useCallback((next: StoredSession | null) => {
    writeSession(next);
    setSession(next);
  }, []);

  const loadProfile = useCallback(async (activeClient: OmniSellClient, activeSession: StoredSession) => {
    const [me, mine] = await Promise.all([
      activeClient.get<AuthedUser>('/auth/me'),
      activeClient.get<TenantSummary[]>('/tenants'),
    ]);
    setUser(me);
    setTenants(mine);
    if (activeSession.tenantId === undefined && mine[0] !== undefined) {
      persist({ ...activeSession, tenantId: mine[0].id });
    }
  }, [persist]);

  useEffect(() => {
    const stored = readSession();
    if (stored === null || isExpired(stored)) {
      writeSession(null);
      setIsLoading(false);
      return;
    }
    setSession(stored);
    const bound = createApiClient(stored.accessToken, stored.tenantId);
    loadProfile(bound, stored)
      .catch(() => {
        // Access token rejected (expired/revoked) — the caller lands back on
        // the login screen rather than a silently broken shell.
        writeSession(null);
        setSession(null);
      })
      .finally(() => setIsLoading(false));
    // Intentionally runs once on mount — `loadProfile` reads the freshly-read
    // cookie value directly rather than depending on `session` state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeTokens = useCallback(
    (tokens: AuthTokens, tenantId?: string) => {
      persist({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        ...(tenantId !== undefined ? { tenantId } : {}),
      });
    },
    [persist],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const anon = createAnonymousApiClient();
      const result = await anon.post<AuthTokens | { mfaRequired: true; challengeToken: string; expiresIn: number }>(
        '/auth/login',
        { email, password },
      );
      if ('mfaRequired' in result) {
        return { status: 'mfa_required', challengeToken: result.challengeToken };
      }
      storeTokens(result);
      const bound = createApiClient(result.accessToken);
      await loadProfile(bound, { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: 0 });
      return { status: 'authenticated' };
    },
    [loadProfile, storeTokens],
  );

  const completeMfaChallenge = useCallback(
    async (challengeToken: string, code: string): Promise<void> => {
      const anon = createAnonymousApiClient();
      const tokens = await anon.post<AuthTokens>('/auth/mfa/challenge', { challengeToken, code });
      storeTokens(tokens);
      const bound = createApiClient(tokens.accessToken);
      await loadProfile(bound, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: 0 });
    },
    [loadProfile, storeTokens],
  );

  const register = useCallback(
    async (input: { email: string; password: string; name?: string; orgName: string }): Promise<void> => {
      const anon = createAnonymousApiClient();
      const tokens = await anon.post<AuthTokens>('/auth/register', input);
      storeTokens(tokens);
      const bound = createApiClient(tokens.accessToken);
      await loadProfile(bound, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: 0 });
    },
    [loadProfile, storeTokens],
  );

  const logout = useCallback(() => {
    persist(null);
    setUser(null);
    setTenants([]);
  }, [persist]);

  const switchTenant = useCallback(
    (tenantId: string) => {
      if (session === null) {
        return;
      }
      persist({ ...session, tenantId });
    },
    [persist, session],
  );

  const refresh = useCallback(async () => {
    if (session === null) {
      return;
    }
    try {
      await loadProfile(client, session);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        logout();
      }
    }
  }, [client, loadProfile, logout, session]);

  const currentTenantId = session?.tenantId ?? null;
  const currentTenant = tenants.find((tenant) => tenant.id === currentTenantId) ?? null;

  const value: SessionContextValue = {
    isLoading,
    user,
    tenants,
    currentTenantId,
    currentTenant,
    client,
    login,
    completeMfaChallenge,
    register,
    logout,
    switchTenant,
    refresh,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
