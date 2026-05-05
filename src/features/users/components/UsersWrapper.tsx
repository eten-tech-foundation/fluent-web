import { useMemo, useState } from 'react';

import { getRouteApi, useNavigate } from '@tanstack/react-router';

import { UserModal } from '@/components/UserModal';
import { UsersPage } from '@/features/users/components/ListUsers';
import { useCreateUser, useUpdateUser, useUsers } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

const routeApi = getRouteApi('/_authenticated/users/');

export const UsersWrapper: React.FC = () => {
  const navigate = useNavigate();

  const { modal, userId } = routeApi.useSearch();

  const { userdetail } = useAppStore();
  const { data: users = [], isLoading } = useUsers(userdetail?.email ?? '');

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
        await updateUserMutation.mutateAsync({
          userData: userData as User,
          email: userdetail?.email ?? '',
        });
      } else {
        const newUser: Omit<User, 'id'> = {
          ...(userData as Omit<User, 'id'>),
          organization: userdetail?.organization ?? 0,
          createdBy: userdetail?.id ?? 0,
          isActive: true,
        };
        await createUserMutation.mutateAsync({
          userData: newUser,
          email: userdetail?.email ?? '',
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
