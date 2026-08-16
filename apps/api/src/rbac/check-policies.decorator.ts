import { SetMetadata } from '@nestjs/common';
import type { AppAbility } from './ability.factory';

export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

/** Route-level authorization: `@CheckPolicies((ability) => ability.can('manage', 'ApiKey'))`. */
export const CheckPolicies = (...handlers: PolicyHandler[]) => SetMetadata(CHECK_POLICIES_KEY, handlers);
