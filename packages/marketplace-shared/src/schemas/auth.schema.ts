import { z } from 'zod';

/**
 * Shared client+server validation for the USER registration/login surfaces
 * built in this pass. The same schema instance is imported by
 * marketplace-web's React Hook Form resolver AND marketplace-api's request
 * validation middleware, so client and server can never silently drift.
 */
export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name must be at most 80 characters'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Sanitized user shape returned by the API — never includes passwordHash. */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.string(),
  countryCode: z.string().length(2).nullable(),
  createdAt: z.string(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  user: authUserSchema,
  token: z.string(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
