/**
 * Client-side session persistence (prompt.md Phase 1.2/1.6 — org switcher).
 *
 * There is no existing auth/session convention in `apps/web` (Phase 0 shipped
 * only a locale cookie — see `components/locale-switcher.tsx`). This mirrors
 * that same "plain cookie, no library" approach rather than introducing
 * zustand/redux for a single small blob of state.
 *
 * Not httpOnly: the access/refresh tokens must be readable by client-side
 * fetches (`OmniSellClient`) since there is no Next.js server-side proxy for
 * `/v1` in this pass. This is a known, accepted trade-off for Phase 1 — see
 * docs/DEBT.md. A production hardening pass should move the refresh token to
 * an httpOnly cookie set by a same-origin Next.js route handler.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Last tenant the org switcher selected — sent as `x-tenant-id`. */
  tenantId?: string;
}

const COOKIE_NAME = 'omnisell_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — matches refresh token TTL

export function readSession(): StoredSession | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (match === undefined) {
    return null;
  }
  try {
    const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession | null): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (session === null) {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
    return;
  }
  const value = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}
