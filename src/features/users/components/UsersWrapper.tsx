import { useMemo, useState } from 'react';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { UserModal } from '@/components/UserModal';
import { UsersPage } from '@/features/users/components/ListUsers';
import { RemoveOrgUserBanner } from '@/features/users/components/RemoveOrgUserBanner';
import {
  useCreateUser,
  useRemoveOrgUser,
  useUpdateOrgUserRole,
  useUpdateUser,
  useUsers,
  type InviteUserPayload,
} from '@/hooks/useUsers';
import { getOrgLevelRoleName } from '@/lib/grant-utils';
import { Logger } from '@/lib/services/logger';
import { ROLES, type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

const routeApi = getRouteApi('/_authenticated/users/');

export const UsersWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { modal, userId } = routeApi.useSearch();

  const { userdetail, setUserDetail } = useAppStore();
  const { data: users = [], isLoading } = useUsers();

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const updateOrgUserRoleMutation = useUpdateOrgUserRole();
  const removeOrgUserMutation = useRemoveOrgUser();
  const [userError, setUserError] = useState<string | null>(null);

  const activeOrgId = userdetail?.lastActiveOrgId ?? userdetail?.organization ?? null;

  const existingEmails = useMemo(() => new Set(users.map(u => u.email.toLowerCase())), [users]);

  const isModalOpen = modal === 'add' || modal === 'edit';
  const mode = modal === 'edit' ? 'edit' : 'create';

  const selectedUser = useMemo(
    () => (userId ? users.find(u => u.id === userId) : undefined),
    [userId, users]
  );

  const [removeTarget, setRemoveTarget] = useState<User | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleClose = () => {
    setUserError(null);
    void navigate({
      to: '/users',
      search: {},
    });
  };

  const handleAddUser = () => {
    void navigate({
      to: '/users',
      search: { modal: 'add' as const },
    });
  };

  const handleEditUser = (user: User) => {
    void navigate({
      to: '/users',
      search: { modal: 'edit' as const, userId: user.id },
    });
  };

  const handleRemoveUser = (user: User) => {
    setRemoveError(null);
    setRemoveTarget(user);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget || activeOrgId == null) return;
    setRemoveError(null);
    try {
      await removeOrgUserMutation.mutateAsync({ orgId: activeOrgId, userId: removeTarget.id });
      toast.success(t('userRemovedFromOrg', { name: removeTarget.username }));
      setRemoveTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setRemoveError(message);
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to remove org user',
      });
    }
  };

  const handleSaveUser = async (userData: User | Omit<User, 'id'>): Promise<void> => {
    setUserError(null);
    try {
      if (mode === 'edit' && selectedUser) {
        // Org-level role changes go through the org-users endpoint (D1: the
        // Users page manages org-level roles only — 'Org Member' demotes).
        const currentOrgRole =
          getOrgLevelRoleName(selectedUser.orgGrants ?? selectedUser.grants, activeOrgId) ??
          ROLES.ORG_MEMBER;
        const requestedRole = (userData as User).role as string | undefined;
        const roleChanged = Boolean(requestedRole && requestedRole !== currentOrgRole);
        const canPatchRole = roleChanged && requestedRole !== undefined && activeOrgId != null;
        const profileChanged =
          userData.username !== selectedUser.username ||
          (userData.firstName ?? '') !== (selectedUser.firstName ?? '') ||
          (userData.lastName ?? '') !== (selectedUser.lastName ?? '');

        let res = selectedUser;
        if (profileChanged) {
          res = await updateUserMutation.mutateAsync({ userData: userData as User });
        }
        if (canPatchRole) {
          res = await updateOrgUserRoleMutation.mutateAsync({
            orgId: activeOrgId,
            userId: selectedUser.id,
            roleName: requestedRole,
          });
        }

        if (selectedUser.email === userdetail?.email && res !== selectedUser) {
          const grants = res.orgGrants ?? res.grants ?? [];
          const activeGrant = grants.find(g => g.orgId === activeOrgId);

          setUserDetail({
            id: res.id,
            email: res.email,
            username: res.username,
            role: activeGrant?.roleName ?? res.role,
            lastActiveOrgId: res.lastActiveOrgId ?? userdetail.lastActiveOrgId,
            grants: grants,
            firstName: res.firstName,
            lastName: res.lastName,
            status: res.status,
          });
        }
      } else {
        const userToInvite = userData as Omit<User, 'id'> & {
          roleName?: string;
          role?: string | number;
        };
        const inviteRoleName =
          userToInvite.roleName ??
          (typeof userToInvite.role === 'string' ? userToInvite.role : String(userToInvite.role));
        const activeGrant = userdetail?.grants?.find(g => g.orgId === activeOrgId);
        const invitePayload: InviteUserPayload = {
          email: userToInvite.email,
          username: userToInvite.displayName ?? userToInvite.username,
          orgId: activeOrgId ?? 0,
          roleName: inviteRoleName,
          orgName: activeGrant?.orgName ?? userdetail?.orgGrants?.[0]?.orgName ?? undefined,
          inviterName: userdetail?.displayName ?? userdetail?.username ?? undefined,
        };

        await createUserMutation.mutateAsync({
          userData: invitePayload,
        });
      }
      handleClose();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'An unknown error occurred');
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: `Failed to ${mode} user`,
      });
      // Rethrow so UserModal can revert the role dropdown on a failed save.
      throw error;
    }
  };

  const mutationIsLoading =
    mode === 'edit'
      ? updateUserMutation.isPending || updateOrgUserRoleMutation.isPending
      : createUserMutation.isPending;
  const mutationError =
    mode === 'edit'
      ? (updateUserMutation.error ?? updateOrgUserRoleMutation.error)?.message
      : createUserMutation.error?.message;

  return (
    <>
      <UsersPage
        activeOrgId={activeOrgId}
        banner={
          removeTarget ? (
            <RemoveOrgUserBanner
              error={removeError}
              orgId={activeOrgId}
              pending={removeOrgUserMutation.isPending}
              user={removeTarget}
              onCancel={() => {
                setRemoveTarget(null);
                setRemoveError(null);
              }}
              onConfirm={() => void handleConfirmRemove()}
            />
          ) : undefined
        }
        currentUserEmail={userdetail?.email}
        loading={isLoading}
        users={users}
        onAddUser={handleAddUser}
        onEditUser={handleEditUser}
        onRemoveUser={handleRemoveUser}
      />

      <UserModal
        activeOrgId={activeOrgId}
        disableRoleSelection={userdetail?.email === selectedUser?.email}
        error={userError ?? mutationError}
        existingEmails={existingEmails}
        isLoading={mutationIsLoading}
        isOpen={isModalOpen}
        mode={mode}
        user={selectedUser}
        onClose={handleClose}
        onSave={handleSaveUser}
      />
    </>
  );
};
