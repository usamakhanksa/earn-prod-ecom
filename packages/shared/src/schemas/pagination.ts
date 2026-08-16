import { z } from 'zod';

/** Cursor pagination query — the only pagination shape used in /v1.
 * `limit` clamps to 100 rather than rejecting an over-large request — a client
 * asking for 500 rows should get the largest page we allow, not a 400. */
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((value) => Math.min(value, 100)),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function emptyPage<T>(): Page<T> {
  return { items: [], nextCursor: null };
}