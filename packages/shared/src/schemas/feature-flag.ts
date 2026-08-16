import { z } from 'zod';

/** Feature-flag definition CRUD (prompt.md Phase 1.11). Platform-admin only — see
 * apps/api/src/admin/admin-only.guard.ts. Per-tenant targeting is a separate,
 * tenant-scoped write (setFeatureFlagTargetSchema). */
export const createFeatureFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lower_snake_case, starting with a letter'),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().default(false),
  rolloutPct: z.number().int().min(0).max(100).optional(),
});
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;

export const updateFeatureFlagSchema = z.object({
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().optional(),
  rolloutPct: z.number().int().min(0).max(100).nullable().optional(),
});
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;

export const setFeatureFlagTargetSchema = z.object({
  isEnabled: z.boolean(),
});
export type SetFeatureFlagTargetInput = z.infer<typeof setFeatureFlagTargetSchema>;

export interface FeatureFlagSummary {
  key: string;
  description: string | null;
  enabled: boolean;
  source: 'target' | 'rollout' | 'default';
}
