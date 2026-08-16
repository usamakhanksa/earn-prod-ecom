import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums';

export const updateNotificationPreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});
export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceSummary {
  type: string;
  inApp: boolean;
  email: boolean;
}
