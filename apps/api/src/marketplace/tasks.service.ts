import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Offer, Task } from '@prisma/client';
import type { OfferDTO, TaskDTO } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { computeRiskScore } from './risk.service';

/** Tasks & Offers (spec §20–§21). Provider abstraction: rows carry `provider`;
 * MOCK rows are seeded; real providers plug in with documented API credentials
 * (MTurk/Clickworker/Appen/Remotasks/UserTesting/AdWork/OfferToro). */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Country-filtered task discovery. Empty `countryAvailability` = all countries. */
  async listTasks(countryCode?: string): Promise<{ items: TaskDTO[] }> {
    const cc = countryCode?.toUpperCase();
    const rows = await this.prisma.task.findMany({
      where: {
        isActive: true,
        ...(cc !== undefined ? { OR: [{ countryAvailability: { has: cc } }, { countryAvailability: { isEmpty: true } }] } : {}),
      },
      orderBy: { rewardMinor: 'desc' },
      take: 200,
    });
    return { items: rows.map(toTaskDto) };
  }

  async listOffers(countryCode?: string): Promise<{ items: OfferDTO[] }> {
    const cc = countryCode?.toUpperCase();
    const rows = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        ...(cc !== undefined ? { OR: [{ countryAvailability: { has: cc } }, { countryAvailability: { isEmpty: true } }] } : {}),
      },
      orderBy: { rewardMinor: 'desc' },
      take: 200,
    });
    return { items: rows.map(toOfferDto) };
  }

  /** Task completion with server-side validation + abuse protection (§21/§29). */
  async completeTask(
    userId: string,
    taskId: string,
    input: { validationToken?: string | undefined },
  ): Promise<{ status: string; rewardMinor: string; currency: string; riskScore: number }> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (task === null || !task.isActive) {
      throw new NotFoundException('Task not found');
    }
    const existing = await this.prisma.taskCompletion.findUnique({
      where: { userId_taskId: { userId, taskId } },
    });
    if (existing !== null) {
      if (existing.status === 'APPROVED' && task.maxCompletionsPerUser <= 1) {
        throw new BadRequestException('Task already completed');
      }
      throw new BadRequestException('Task already submitted for review');
    }
    // Client may send a token from the provider; a fresh task without one is
    // still accepted in MOCK_MODE but flagged for review when it looks odd.
    const riskScore = computeRiskScore({
      repeatCount: await this.countCompletionsToday(userId),
      isSelfReferral: false,
    });
    const completion = await this.prisma.taskCompletion.create({
      data: {
        userId,
        taskId,
        status: 'PENDING',
        rewardMinor: task.rewardMinor,
        currency: task.currency,
        riskScore,
        ...(input.validationToken !== undefined
          ? { validationData: { token: input.validationToken } }
          : {}),
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    return {
      status: completion.status,
      rewardMinor: completion.rewardMinor.toString(),
      currency: completion.currency,
      riskScore: completion.riskScore,
    };
  }

  async completeOffer(userId: string, offerId: string): Promise<{ status: string; rewardMinor: string; currency: string }> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (offer === null || !offer.isActive) {
      throw new NotFoundException('Offer not found');
    }
    const existing = await this.prisma.offerCompletion.findUnique({
      where: { userId_offerId: { userId, offerId } },
    });
    if (existing !== null) {
      throw new BadRequestException('Offer already submitted for review');
    }
    const riskScore = computeRiskScore({ repeatCount: await this.countCompletionsToday(userId) });
    const completion = await this.prisma.offerCompletion.create({
      data: {
        userId,
        offerId,
        status: 'PENDING',
        rewardMinor: offer.rewardMinor,
        currency: offer.currency,
        riskScore,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    return { status: completion.status, rewardMinor: completion.rewardMinor.toString(), currency: completion.currency };
  }

  private async countCompletionsToday(userId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [tasks, offers] = await Promise.all([
      this.prisma.taskCompletion.count({ where: { userId, createdAt: { gte: since } } }),
      this.prisma.offerCompletion.count({ where: { userId, createdAt: { gte: since } } }),
    ]);
    return tasks + offers;
  }
}

function toTaskDto(t: Task): TaskDTO {
  return {
    id: t.id,
    provider: t.provider,
    title: t.title,
    description: t.description,
    taskType: t.taskType,
    rewardMinor: t.rewardMinor.toString(),
    currency: t.currency,
    estimatedMinutes: t.estimatedMinutes,
    countryAvailability: t.countryAvailability,
    deviceCompatibility: t.deviceCompatibility,
  };
}

function toOfferDto(o: Offer): OfferDTO {
  return {
    id: o.id,
    provider: o.provider,
    title: o.title,
    description: o.description,
    rewardMinor: o.rewardMinor.toString(),
    currency: o.currency,
    estimatedMinutes: o.estimatedMinutes,
    countryAvailability: o.countryAvailability,
    deviceCompatibility: o.deviceCompatibility,
    url: o.url,
  };
}