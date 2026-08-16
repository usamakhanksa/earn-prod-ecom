import { z } from 'zod';

/** TOTP code — 6 digits, otplib default (RFC 6238). Recovery codes are 10 hex chars. */
export const totpCodeSchema = z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code from your authenticator app');

export const mfaVerifySchema = z.object({
  code: z.string().min(6).max(64),
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaChallengeSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(6).max(64),
  deviceId: z.string().optional(),
});
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;
