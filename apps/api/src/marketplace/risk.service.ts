import { createHash } from 'node:crypto';

export interface RiskContext {
  /** how many times this visitor has completed the same action */
  repeatCount: number;
  /** true when the actor is the same user who owns the payee (self-referral) */
  isSelfReferral?: boolean;
  /** true when the referrer is on a cooldown / over daily earnings cap */
  isOverCap?: boolean;
  /** suspicious IP patterns (VPN/datacenter proxy) flagged upstream */
  suspiciousIp?: boolean;
  /** device fingerprint reused across many accounts */
  sharedDevice?: boolean;
}

/**
 * Returns a risk score from 0 (clean) to 100 (certain abuse). Pure function so
 * it is deterministic and unit-testable. The API never auto-bans on score
 * alone — it flags for admin review per spec §21.
 */
export function computeRiskScore(ctx: RiskContext): number {
  let score = 0;
  if (ctx.isSelfReferral === true) score += 40;
  if (ctx.repeatCount >= 5) score += 25;
  else if (ctx.repeatCount >= 2) score += 10;
  if (ctx.isOverCap === true) score += 15;
  if (ctx.suspiciousIp === true) score += 20;
  if (ctx.sharedDevice === true) score += 15;
  return Math.min(100, score);
}

/** Deterministic, non-reversible hash of a raw IP for storage (never logs/saves raw IPs). */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 40);
}

/** Lightweight visitor fingerprint from the request, used only for fraud flags. */
export function deviceFromUserAgent(userAgent: string | undefined): 'MOBILE' | 'DESKTOP' | 'TABLET' | 'UNKNOWN' {
  if (userAgent === undefined) return 'UNKNOWN';
  const ua = userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)/.test(ua)) return 'TABLET';
  if (/(mobile|iphone|ipod|android)/.test(ua)) return 'MOBILE';
  if (/mobi/.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}