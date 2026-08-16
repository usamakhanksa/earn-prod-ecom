import * as SecureStore from 'expo-secure-store';

/**
 * Native token storage (prompt.md Phase 1.9 — "secure-store tokens").
 * `expo-secure-store` wraps iOS Keychain / Android Keystore — appropriate for
 * refresh tokens, unlike the web app's cookie (see apps/web/lib/session-storage.ts's
 * doc comment on that trade-off). Not exercised on a real device/emulator in
 * this sandbox (no Docker, no device) — see docs/DEBT.md.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const KEY = 'omnisell_session';

export async function readSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSession(session: StoredSession | null): Promise<void> {
  if (session === null) {
    await SecureStore.deleteItemAsync(KEY);
    return;
  }
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

const BIOMETRIC_PREF_KEY = 'omnisell_biometric_unlock_enabled';

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY)) === '1';
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? '1' : '0');
}
