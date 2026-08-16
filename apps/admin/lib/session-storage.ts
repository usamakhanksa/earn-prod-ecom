/** Same trade-off as apps/web/lib/session-storage.ts — see its doc comment. */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const COOKIE_NAME = 'omnisell_admin_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readSession(): StoredSession | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (match === undefined) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1))) as StoredSession;
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
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}
