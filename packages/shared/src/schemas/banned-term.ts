import { z } from 'zod';
import { BANNED_TERM_CATEGORIES, BANNED_TERM_MATCH_TYPES } from '../enums';

/**
 * IP/trademark policy linter dictionary (4.11) — global, admin-editable
 * (featureslist.md 5.15's hard publish-blocking gate; api-registration.md's
 * moderation console mention of a "banned-term dictionary editor").
 */

export const createBannedTermSchema = z.object({
  term: z.string().min(2).max(200),
  category: z.enum(BANNED_TERM_CATEGORIES).default('TRADEMARK'),
  matchType: z.enum(BANNED_TERM_MATCH_TYPES).default('FUZZY'),
  note: z.string().max(1000).optional(),
});
export type CreateBannedTermInput = z.infer<typeof createBannedTermSchema>;

export const updateBannedTermSchema = z.object({
  term: z.string().min(2).max(200).optional(),
  category: z.enum(BANNED_TERM_CATEGORIES).optional(),
  matchType: z.enum(BANNED_TERM_MATCH_TYPES).optional(),
  note: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateBannedTermInput = z.infer<typeof updateBannedTermSchema>;

export interface BannedTermView {
  id: string;
  term: string;
  category: (typeof BANNED_TERM_CATEGORIES)[number];
  matchType: (typeof BANNED_TERM_MATCH_TYPES)[number];
  note: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
