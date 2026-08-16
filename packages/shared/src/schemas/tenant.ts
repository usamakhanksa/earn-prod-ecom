import { z } from 'zod';
import { ORG_ROLES } from '../enums';

export const updateMemberRoleSchema = z.object({
  role: z.enum(ORG_ROLES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  plan: string;
  currency: string;
  role: string;
}

export interface MemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
}
