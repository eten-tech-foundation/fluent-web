import { useMemo, useState } from 'react';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  useOrganization,
  useOrganizationUsers,
} from '@/features/organizations/hooks/useOrganizations';
import { useCreateUser, type InviteUserPayload } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { InviteOrgManagerModal, type InviteOrgManagerData } from './InviteOrgManagerModal';
import { OrganizationDetailPage } from './OrganizationDetailPage';

const routeApi = getRouteApi('/_authenticated/organizations/$orgId/');

export const OrganizationDetailWrapper: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { orgId: orgIdParam } = routeApi.useParams();
  const { modal } = routeApi.useSearch();
  const orgId = Number(orgIdParam);

  const { userdetail } = useAppStore();
  const { data: organization, isLoading: orgLoading } = useOrganization(orgId);
  const { data: members = [], isLoading: membersLoading } = useOrganizationUsers(orgId);
  const createUserMutation = useCreateUser();
  const [inviteError, setInviteError] = useState<string | null>(null);

  const existingEmails = useMemo(() => new Set(members.map(m => m.email.toLowerCase())), [members]);

  const handleBack = () => {
    void navigate({ to: '/organizations', search: {} });
  };

  const handleOpenInvite = () => {
    setInviteError(null);
    void navigate({
      to: '/organizations/$orgId',
      params: { orgId: orgIdParam },
      search: { modal: 'add' as const },
    });
  };

  const handleCloseInvite = () => {
    setInviteError(null);
    void navigate({ to: '/organizations/$orgId', params: { orgId: orgIdParam }, search: {} });
  };

  const handleInvite = async ({ email, username }: InviteOrgManagerData): Promise<void> => {
    setInviteError(null);
    const payload: InviteUserPayload = {
      email,
      username,
      orgId,
      projectId: null,
      roleName: ROLES.ORG_MANAGER,
      orgName: organization?.name,
      inviterName: userdetail?.displayName ?? userdetail?.username ?? undefined,
    };
    try {
      const { created } = await createUserMutation.mutateAsync({ userData: payload });
      toast.success(
        created ? t('inviteSent', { email }) : t('existingUserAddedAsOrgManager', { email })
      );
      handleCloseInvite();
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'An unknown error occurred');
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to invite org manager',
      });
      throw error;
    }
  };

  return (
    <>
      <OrganizationDetailPage
        loading={orgLoading || membersLoading}
        members={members}
        organization={organization}
        onBack={handleBack}
        onInviteOrgManager={handleOpenInvite}
      />

      <InviteOrgManagerModal
        error={inviteError}
        existingEmails={existingEmails}
        isLoading={createUserMutation.isPending}
        isOpen={modal === 'add'}
        onClose={handleCloseInvite}
        onInvite={handleInvite}
      />
    </>
  );
};
