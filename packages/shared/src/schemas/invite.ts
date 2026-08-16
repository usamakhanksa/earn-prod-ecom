import { z } from 'zod';
import { ORG_ROLES } from '../enums';

export const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORG_ROLES),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export interface InviteSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}
