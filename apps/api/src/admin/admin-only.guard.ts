import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

/**
 * Platform-admin gate (prompt.md Phase 1.8 / featureslist.md §0.2).
 *
 * Deliberately minimal per this pass's scope: `User.isPlatformAdmin` is a boolean
 * column, not a separate `AdminUser`/`AdminRole` model — reusing the same JWT
 * session as the tenant apps rather than inventing a parallel auth system. Must
 * run after `JwtAuthGuard`. A real admin-role hierarchy (SUPER_ADMIN vs scoped
 * support roles from featureslist.md §0.2) is deferred — see docs/DEBT.md.
 */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { isPlatformAdmin: true },
    });
    if (user?.isPlatformAdmin !== true) {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
