import { useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { isBiometricUnlockEnabled } from './secure-session';

export type BiometricGateStatus = 'checking' | 'not-required' | 'unlocked' | 'locked' | 'unsupported';

/**
 * Biometric app unlock (prompt.md Phase 1.9 / featureslist.md 1.6 — Face/Touch/
 * Android Biometric). Wired against the real `expo-local-authentication` API
 * end-to-end, but this environment has no device/emulator to actually trigger
 * a native biometric prompt — the guard's *logic* (feature-detect hardware,
 * gate rendering until authenticated when the user has opted in) is real and
 * exercised in code review, not "run on a device" terms. See docs/DEBT.md.
 */
export function useBiometricGate(): { status: BiometricGateStatus; retry: () => void } {
  const [status, setStatus] = useState<BiometricGateStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      const enabled = await isBiometricUnlockEnabled();
      if (!enabled) {
        if (!cancelled) setStatus('not-required');
        return;
      }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock OmniSell',
        disableDeviceFallback: false,
      });
      if (!cancelled) {
        setStatus(result.success ? 'unlocked' : 'locked');
      }
    }

    setStatus('checking');
    void run();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { status, retry: () => setAttempt((value) => value + 1) };
}
