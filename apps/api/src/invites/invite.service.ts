import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { InviteSummary } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InviteRepository } from '../repositories/invite.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { MailerService } from '../mailer/mailer.service';
import { AuditLogService } from '../audit/audit-log.service';
import { NotificationService } from '../notifications/notification.service';
import { env } from '../config/env';

/**
 * Org invite flow (prompt.md Phase 1.6 / featureslist.md 1.10 — pending/expired
 * invite management). Conservative default recorded in docs/OPEN_QUESTIONS.md
 * (#16): acceptance requires an existing OmniSell account whose email matches
 * the invite — no anonymous account auto-provisioning straight from a bare
 * token in this pass. `accept()` deliberately looks the invite up directly by
 * `tokenHash` (not through `InviteRepository`, which requires a known tenantId)
 * for the same reason `AuthService` does the same thing for password-reset
 * tokens: the opaque unguessable token IS the authorization boundary here, the
 * caller does not know the tenant yet.
 */
@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InviteRepository,
    private readonly memberships: MembershipRepository,
    private readonly mailer: MailerService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationService,
  ) {}

  async create(tenantId: string, invitedById: string, email: string, role: string): Promise<InviteSummary> {
    const existingPending = await this.invites.findActivePending(tenantId, email);
    if (existingPending !== null) {
      throw new ConflictException('There is already a pending invite for this email');
    }

    const token = randomUUID();
    const invite = await this.invites.create({
      tenantId,
      email,
      role,
      tokenHash: hashInviteToken(token),
      invitedById,
      expiresAt: addDays(new Date(), env.INVITE_TTL_DAYS),
    });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const acceptUrl = `${env.APP_URL}/invites/accept?token=${token}`;
    await this.mailer.send({
      to: email,
      subject: `You've been invited to join ${tenant?.name ?? 'an OmniSell workspace'}`,
      text: `Accept your invite: ${acceptUrl}`,
      html: `<p>You've been invited to join <strong>${tenant?.name ?? 'OmniSell'}</strong> as ${role}.</p><p><a href="${acceptUrl}">Accept invite</a></p>`,
    });

    await this.audit.record({
      tenantId,
      actorId: invitedById,
      action: 'invite.created',
      entityType: 'Invite',
      entityId: invite.id,
      after: { email: invite.email, role: invite.role },
    });

    return this.toSummary(invite);
  }

  async listForTenant(tenantId: string): Promise<InviteSummary[]> {
    const invites = await this.invites.listForTenant(tenantId);
    return invites.map((invite) => this.toSummary(invite));
  }

  async revoke(tenantId: string, inviteId: string, actorId: string): Promise<void> {
    const invite = await this.invites.findById(tenantId, inviteId);
    if (invite === null) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.status !== 'PENDING') {
      throw new ConflictException(`Cannot revoke an invite with status ${invite.status}`);
    }
    await this.invites.updateStatus(tenantId, inviteId, 'REVOKED');
    await this.audit.record({
      tenantId,
      actorId,
      action: 'invite.revoked',
      entityType: 'Invite',
      entityId: inviteId,
      before: { status: invite.status },
      after: { status: 'REVOKED' },
    });
  }

  async resend(tenantId: string, inviteId: string, actorId: string): Promise<InviteSummary> {
    const invite = await this.invites.findById(tenantId, inviteId);
    if (invite === null) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.status !== 'PENDING' && !this.isExpired(invite)) {
      throw new ConflictException(`Cannot resend an invite with status ${invite.status}`);
    }
    const token = randomUUID();
    const updated = await this.invites.reissue(tenantId, inviteId, hashInviteToken(token), addDays(new Date(), env.INVITE_TTL_DAYS));
    const acceptUrl = `${env.APP_URL}/invites/accept?token=${token}`;
    await this.mailer.send({
      to: updated.email,
      subject: 'Your OmniSell invite was resent',
      text: `Accept your invite: ${acceptUrl}`,
      html: `<p><a href="${acceptUrl}">Accept invite</a></p>`,
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'invite.resent',
      entityType: 'Invite',
      entityId: inviteId,
    });
    return this.toSummary(updated);
  }

  /** Requires an authenticated caller whose email matches the invite (see class
   * doc comment for the conservative default this implements). */
  async accept(token: string, callerUserId: string): Promise<{ tenantId: string; role: string }> {
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
    if (invite === null) {
      throw new UnauthorizedException('Invalid or unknown invite token');
    }
    if (invite.status === 'ACCEPTED') {
      throw new ConflictException('This invite has already been accepted');
    }
    if (invite.status === 'REVOKED') {
      throw new ConflictException('This invite has been revoked');
    }
    if (this.isExpired(invite)) {
      await this.prisma.invite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new ConflictException('This invite has expired');
    }

    const caller = await this.prisma.user.findUnique({ where: { id: callerUserId }, select: { email: true } });
    if (caller === null || caller.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('Log in with the email address this invite was sent to');
    }

    const existingMembership = await this.memberships.findActive(invite.tenantId, callerUserId);
    if (existingMembership === null) {
      await this.prisma.membership.create({
        data: { tenantId: invite.tenantId, userId: callerUserId, role: invite.role },
      });
    }
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: callerUserId },
    });

    await this.audit.record({
      tenantId: invite.tenantId,
      actorId: callerUserId,
      action: 'invite.accepted',
      entityType: 'Invite',
      entityId: invite.id,
    });

    await this.notifications.dispatch({
      tenantId: invite.tenantId,
      userId: invite.invitedById,
      type: 'TEAM',
      title: 'Invite accepted',
      body: `${invite.email} accepted your invite and joined as ${invite.role}.`,
    });

    return { tenantId: invite.tenantId, role: invite.role };
  }

  private isExpired(invite: { status: string; expiresAt: Date }): boolean {
    return invite.status === 'PENDING' && invite.expiresAt < new Date();
  }

  private toSummary(invite: {
    id: string;
    email: string;
    role: string;
    status: string;
    invitedById: string;
    expiresAt: Date;
    createdAt: Date;
    acceptedAt: Date | null;
  }): InviteSummary {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: this.isExpired(invite) ? 'EXPIRED' : invite.status,
      invitedByUserId: invite.invitedById,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    };
  }
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
