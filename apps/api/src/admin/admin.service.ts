import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Small helper alongside `AdminOnlyGuard` for services that need to branch on
 * platform-admin status rather than hard-reject the whole route (e.g.
 * `FeatureFlagService.setTarget`, which allows a tenant OWNER/ADMIN to target
 * their own tenant but only a platform admin to target any other tenant). */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } });
    return user?.isPlatformAdmin ?? false;
  }
}
