import { Injectable } from '@nestjs/common';
import type { Prisma, VideoWatch } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class VideoWatchRepository extends TenantScopedRepository<Pick<PrismaService, 'videoWatch'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: {
    tenantId: string;
    userId: string;
    videoId: string;
    startTime: Date;
    deviceFingerprint?: string | null;
    ipAddress?: string | null;
  }): Promise<VideoWatch> {
    return this.prisma.videoWatch.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        videoId: input.videoId,
        startTime: input.startTime,
        status: 'STARTED',
        deviceFingerprint: input.deviceFingerprint ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async findById(tenantId: string, id: string, client: Client = this.prisma): Promise<VideoWatch | null> {
    return client.videoWatch.findFirst({ where: { id, tenantId } });
  }

  /** §9.1's "latest watch in WATCHING state" lookup for the public
   * `/wallet/earn/video-watch` alias (§17 locked default #3). */
  async findLatestWatching(tenantId: string, userId: string, videoId: string): Promise<VideoWatch | null> {
    return this.prisma.videoWatch.findFirst({
      where: { tenantId, userId, videoId, status: { in: ['STARTED', 'WATCHING'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** §8.1 concurrent-session fraud signal: any OTHER open session for the same (user, video). */
  async countOtherOpenSessions(tenantId: string, userId: string, videoId: string, excludeId: string): Promise<number> {
    return this.prisma.videoWatch.count({
      where: { tenantId, userId, videoId, id: { not: excludeId }, status: { in: ['STARTED', 'WATCHING'] } },
    });
  }

  /** §8.1 IP/device fan-out signal: distinct device fingerprints seen from this
   * IP today. */
  async countDistinctDevicesForIpToday(tenantId: string, ipAddress: string, since: Date): Promise<number> {
    const rows = await this.prisma.videoWatch.findMany({
      where: { tenantId, ipAddress, createdAt: { gte: since }, deviceFingerprint: { not: null } },
      select: { deviceFingerprint: true },
      distinct: ['deviceFingerprint'],
    });
    return rows.length;
  }

  async recordHeartbeat(
    tenantId: string,
    id: string,
    patch: { watchSeconds: number; heartbeatCount: number; maxGapSeconds: number; lastHeartbeatAt: Date; lastWatchPosition: number; status?: 'WATCHING' },
    client: Client = this.prisma,
  ): Promise<VideoWatch> {
    return client.videoWatch.update({
      where: { id, tenantId },
      data: {
        watchSeconds: patch.watchSeconds,
        heartbeatCount: patch.heartbeatCount,
        maxGapSeconds: patch.maxGapSeconds,
        lastHeartbeatAt: patch.lastHeartbeatAt,
        lastWatchPosition: patch.lastWatchPosition,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
    });
  }

  async markCompleted(tenantId: string, id: string, endTime: Date, watchSeconds: number, client: Client = this.prisma): Promise<VideoWatch> {
    return client.videoWatch.update({ where: { id, tenantId }, data: { status: 'COMPLETED', endTime, watchSeconds } });
  }

  async markCredited(tenantId: string, id: string, transactionId: string, client: Client = this.prisma): Promise<VideoWatch> {
    return client.videoWatch.update({ where: { id, tenantId }, data: { status: 'CREDITED', transactionId } });
  }

  async markFraudSuspect(tenantId: string, id: string, signals: string[], client: Client = this.prisma): Promise<VideoWatch> {
    return client.videoWatch.update({
      where: { id, tenantId },
      data: { status: 'FRAUD_SUSPECT', fraudSignals: signals as unknown as Prisma.InputJsonValue },
    });
  }

  /** Admin fraud review queue (§8.5/§10.3). */
  async listFraudSuspect(tenantId: string, limit = 50): Promise<VideoWatch[]> {
    return this.prisma.videoWatch.findMany({
      where: { tenantId, status: 'FRAUD_SUSPECT' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async approveFraudSuspect(tenantId: string, id: string, transactionId: string, client: Client = this.prisma): Promise<VideoWatch> {
    return client.videoWatch.update({ where: { id, tenantId }, data: { status: 'CREDITED', transactionId } });
  }

  async rejectFraudSuspect(tenantId: string, id: string, client: Client = this.prisma): Promise<VideoWatch> {
    return client.videoWatch.update({ where: { id, tenantId }, data: { status: 'FRAUD_SUSPECT' } });
  }
}
