import { z } from 'zod';
import { OAUTH_PROVIDERS } from '../enums';

export const oauthProviderParamSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
});

export const oauthStartQuerySchema = z.object({
  state: z.string().min(1).max(256).optional(),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});
export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
