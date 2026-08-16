import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { OmniSellClient } from '@omnisell/api-client';
import type { TenantSummary } from '@omnisell/shared';
import { createApiClient, createAnonymousApiClient } from './api-client';
import { readSession, writeSession, type StoredSession } from './secure-session';

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
  client: OmniSellClient;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeMfaChallenge: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const client = useMemo(() => createApiClient(session?.accessToken), [session?.accessToken]);

  const loadProfile = useCallback(async (activeClient: OmniSellClient) => {
    const [me, mine] = await Promise.all([
      activeClient.get<AuthedUser>('/auth/me'),
      activeClient.get<TenantSummary[]>('/tenants'),
    ]);
    setUser(me);
    setTenants(mine);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await readSession();
      if (stored === null || isExpired(stored)) {
        await writeSession(null);
        if (!cancelled) setIsLoading(false);
        return;
      }
      if (!cancelled) setSession(stored);
      try {
        await loadProfile(createApiClient(stored.accessToken));
      } catch {
        await writeSession(null);
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const storeTokens = useCallback(async (tokens: AuthTokens) => {
    const next: StoredSession = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    };
    await writeSession(next);
    setSession(next);
  }, []);

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
      await storeTokens(result);
      await loadProfile(createApiClient(result.accessToken));
      return { status: 'authenticated' };
    },
    [loadProfile, storeTokens],
  );

  const completeMfaChallenge = useCallback(
    async (challengeToken: string, code: string): Promise<void> => {
      const anon = createAnonymousApiClient();
      const tokens = await anon.post<AuthTokens>('/auth/mfa/challenge', { challengeToken, code });
      await storeTokens(tokens);
      await loadProfile(createApiClient(tokens.accessToken));
    },
    [loadProfile, storeTokens],
  );

  const logout = useCallback(async () => {
    await writeSession(null);
    setSession(null);
    setUser(null);
    setTenants([]);
  }, []);

  const value: SessionContextValue = { isLoading, user, tenants, client, login, completeMfaChallenge, logout };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
