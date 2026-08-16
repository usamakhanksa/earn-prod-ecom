'use client';

import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import type { InviteSummary, MemberSummary } from '@omnisell/shared';
import { ORG_ROLES } from '@omnisell/shared';
import { Badge, Button, Skeleton } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

/** Web Crypto's `randomUUID()` is available in every browser this app targets. */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export default function TeamPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client, currentTenantId } = useSession();

  const [members, setMembers] = useState<MemberSummary[] | null>(null);
  const [invites, setInvites] = useState<InviteSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('DESIGNER');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const load = useCallback(async () => {
    if (currentTenantId === null) {
      return;
    }
    setLoadError(null);
    try {
      const [memberList, inviteList] = await Promise.all([
        client.get<MemberSummary[]>(`/tenants/${currentTenantId}/members`),
        client.get<InviteSummary[]>(`/tenants/${currentTenantId}/invites`),
      ]);
      setMembers(memberList);
      setInvites(inviteList);
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : t('common.error'));
    }
  }, [client, currentTenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (currentTenantId === null) {
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      await client.post(
        `/tenants/${currentTenantId}/invites`,
        { email: inviteEmail, role: inviteRole },
        newIdempotencyKey(),
      );
      setInviteEmail('');
      setInviteSuccess(true);
      await load();
    } catch (error) {
      setInviteError(error instanceof ApiRequestError ? error.message : t('common.error'));
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRevoke(inviteId: string): Promise<void> {
    if (currentTenantId === null) {
      return;
    }
    await client.post(`/tenants/${currentTenantId}/invites/${inviteId}/revoke`, {});
    await load();
  }

  async function handleResend(inviteId: string): Promise<void> {
    if (currentTenantId === null) {
      return;
    }
    await client.post(`/tenants/${currentTenantId}/invites/${inviteId}/resend`, {}, newIdempotencyKey());
    await load();
  }

  async function handleRoleChange(membershipId: string, role: string): Promise<void> {
    await client.patch(`/members/${membershipId}`, { role });
    await load();
  }

  async function handleRemove(membershipId: string): Promise<void> {
    await client.delete(`/members/${membershipId}`);
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{t('team.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('team.subtitle')}</p>
      </header>

      <section aria-labelledby="invite-heading" className="rounded-lg border border-border-subtle p-5 shadow-sh1">
        <h2 id="invite-heading" className="text-sm font-semibold text-text-primary">
          {t('team.invite.title')}
        </h2>
        <form onSubmit={handleInvite} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px] text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('auth.email')}</span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-text-primary">{t('team.role')}</span>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              className="rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary"
            >
              {ORG_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`team.roleLabel.${role}` as const)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" loading={inviteBusy}>
            {t('team.invite.submit')}
          </Button>
        </form>
        {inviteError !== null ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {inviteError}
          </p>
        ) : null}
        {inviteSuccess ? (
          <p role="status" className="mt-2 text-sm text-success">
            {t('team.invite.success')}
          </p>
        ) : null}
      </section>

      {loadError !== null ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-sm font-semibold text-text-primary">
          {t('team.members.title')}
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle">
          {members === null ? (
            <div className="p-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="mt-2 h-5 w-full" />
            </div>
          ) : members.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">{t('common.empty')}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 text-start">{t('auth.email')}</th>
                  <th className="px-4 py-2 text-start">{t('team.role')}</th>
                  <th className="px-4 py-2 text-start">{t('team.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.membershipId} className="border-t border-border-subtle">
                    <td className="px-4 py-2 text-text-primary">{member.name ?? member.email}</td>
                    <td className="px-4 py-2">
                      <select
                        value={member.role}
                        onChange={(event) => void handleRoleChange(member.membershipId, event.target.value)}
                        aria-label={t('team.role')}
                        className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-sm text-text-primary"
                      >
                        {ORG_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t(`team.roleLabel.${role}` as const)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <Button variant="ghost" size="sm" onClick={() => void handleRemove(member.membershipId)}>
                        {t('team.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="text-sm font-semibold text-text-primary">
          {t('team.invites.title')}
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle">
          {invites === null ? (
            <div className="p-4">
              <Skeleton className="h-5 w-full" />
            </div>
          ) : invites.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">{t('team.invites.empty')}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 text-start">{t('auth.email')}</th>
                  <th className="px-4 py-2 text-start">{t('team.role')}</th>
                  <th className="px-4 py-2 text-start">{t('team.invites.status')}</th>
                  <th className="px-4 py-2 text-start">{t('team.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-t border-border-subtle">
                    <td className="px-4 py-2 text-text-primary">{invite.email}</td>
                    <td className="px-4 py-2 text-text-secondary">{t(`team.roleLabel.${invite.role}` as const)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={statusTone(invite.status)}>{t(`team.invites.status.${invite.status.toLowerCase()}`)}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {invite.status === 'PENDING' ? (
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => void handleResend(invite.id)}>
                            {t('team.invites.resend')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void handleRevoke(invite.id)}>
                            {t('team.invites.revoke')}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'ACCEPTED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REVOKED':
    case 'EXPIRED':
      return 'danger';
    default:
      return 'neutral';
  }
}
