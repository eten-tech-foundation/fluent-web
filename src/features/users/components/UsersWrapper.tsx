import { useMemo, useState } from 'react';

import { getRouteApi, useNavigate } from '@tanstack/react-router';

import { UserModal } from '@/components/UserModal';
import { UsersPage } from '@/features/users/components/ListUsers';
import { useCreateUser, useUpdateUser, useUsers, type InviteUserPayload } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

const routeApi = getRouteApi('/_authenticated/users/');

export const UsersWrapper: React.FC = () => {
  const navigate = useNavigate();

  const { modal, userId } = routeApi.useSearch();

  const { userdetail, setUserDetail } = useAppStore();
  const { data: users = [], isLoading } = useUsers();

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const [userError, setUserError] = useState<string | null>(null);

  const isModalOpen = modal === 'add' || modal === 'edit';
  const mode = modal === 'edit' ? 'edit' : 'create';

  const selectedUser = useMemo(
    () => (userId ? users.find(u => u.id === userId) : undefined),
    [userId, users]
  );

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

  const handleSaveUser = async (userData: User | Omit<User, 'id'>): Promise<void> => {
    setUserError(null);
    try {
      if (mode === 'edit' && selectedUser) {
        const res = await updateUserMutation.mutateAsync({
          userData: userData as User,
        });
        if (selectedUser.email === userdetail?.email) {
          const grants = res.orgGrants ?? res.grants ?? [];
          const activeOrgId =
            userdetail.lastActiveOrgId ?? grants.find(g => g.orgId !== null)?.orgId;
          const activeGrant = grants.find(g => g.orgId === activeOrgId);

          setUserDetail({
            id: res.id,
            email: res.email,
            username: res.username,
            role: activeGrant?.roleId ?? res.role,
            lastActiveOrgId: res.lastActiveOrgId ?? userdetail.lastActiveOrgId,
            grants: grants,
            firstName: res.firstName,
            lastName: res.lastName,
            status: res.status,
          });
        }
      } else {
        const userToInvite = userData as Omit<User, 'id'>;
        const invitePayload: InviteUserPayload = {
          email: userToInvite.email,
          username: userToInvite.displayName ?? userToInvite.username,
          orgId: userdetail?.lastActiveOrgId ?? userdetail?.organization ?? 0,
          roleId: userToInvite.role,
          orgName: userdetail?.orgGrants?.[0]?.orgName ?? undefined,
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
    }
  };

  const mutationIsLoading =
    mode === 'edit' ? updateUserMutation.isPending : createUserMutation.isPending;
  const mutationError =
    mode === 'edit' ? updateUserMutation.error?.message : createUserMutation.error?.message;

  return (
    <>
      <UsersPage
        loading={isLoading}
        users={users}
        onAddUser={handleAddUser}
        onEditUser={handleEditUser}
      />

      <UserModal
        disableRoleSelection={userdetail?.email === selectedUser?.email}
        error={userError ?? mutationError}
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
