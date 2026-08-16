/**
 * Feature-flag registry. Incomplete features are stubbed behind a flag and tracked in
 * docs/DEBT.md — never shipped as hardcoded/fake UI.
 */
export const FEATURE_FLAGS = [
  'zatca_einvoicing',
  'gigs_module',
  'consumer_points',
  'fraud_detection',
  'referral_earning',
  'points_expiry',
  'connectors_wave2',
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  zatca_einvoicing: false,
  gigs_module: false,
  consumer_points: true,
  fraud_detection: true,
  referral_earning: false,
  points_expiry: false,
  connectors_wave2: false,
};