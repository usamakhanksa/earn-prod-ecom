import { Injectable } from '@nestjs/common';
import type { VideoContent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

export interface CreateVideoContentInput {
  tenantId: string;
  title: string;
  url: string;
  durationSeconds: number;
  thumbnailUrl?: string | null;
  pointsPerView?: number | null;
  isActive: boolean;
}

@Injectable()
export class VideoContentRepository extends TenantScopedRepository<Pick<PrismaService, 'videoContent'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: CreateVideoContentInput): Promise<VideoContent> {
    return this.prisma.videoContent.create({
      data: {
        tenantId: input.tenantId,
        title: input.title,
        url: input.url,
        durationSeconds: input.durationSeconds,
        thumbnailUrl: input.thumbnailUrl ?? null,
        pointsPerView: input.pointsPerView ?? null,
        isActive: input.isActive,
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<VideoContent | null> {
    return this.prisma.videoContent.findFirst({ where: { id, tenantId } });
  }

  async listActive(tenantId: string): Promise<VideoContent[]> {
    return this.prisma.videoContent.findMany({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  /** Admin/creator moderation view — includes inactive/archived rows too. */
  async listAll(tenantId: string): Promise<VideoContent[]> {
    return this.prisma.videoContent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async update(
    tenantId: string,
    id: string,
    patch: { title?: string | undefined; thumbnailUrl?: string | null | undefined; pointsPerView?: number | null | undefined; isActive?: boolean | undefined },
  ): Promise<VideoContent> {
    return this.prisma.videoContent.update({
      where: { id, tenantId },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.thumbnailUrl !== undefined ? { thumbnailUrl: patch.thumbnailUrl } : {}),
        ...(patch.pointsPerView !== undefined ? { pointsPerView: patch.pointsPerView } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });
  }

  /** Archive, never a hard delete — matches the base catalog's archive convention. */
  async archive(tenantId: string, id: string): Promise<VideoContent> {
    return this.prisma.videoContent.update({ where: { id, tenantId }, data: { isActive: false } });
  }
}
