import { UserModal } from '@/components/UserModal';
import { useUpdateUser } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

interface EditProfileProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function EditProfile({ isOpen, onClose }: EditProfileProps) {
  const { userdetail, setUserDetail } = useAppStore();
  const updateUserMutation = useUpdateUser();

  const isModalOpen = isOpen ?? true;
  const handleClose = onClose ?? (() => window.history.back());

  const handleSaveUser = async (userData: User | Omit<User, 'id'>): Promise<void> => {
    try {
      // Updating existing user
      const res = await updateUserMutation.mutateAsync({
        userData: userData as User,
        email: userdetail ? userdetail.email : '',
      });
      setUserDetail({
        id: res.id,
        email: res.email,
        username: res.username,
        role: res.role,
        organization: res.organization,
        firstName: res.firstName,
        lastName: res.lastName,
        status: res.status,
      });

      handleClose();
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to update user profile',
      });
    }
  };

  return (
    <UserModal
      disableRoleSelection={true}
      isLoading={updateUserMutation.isPending}
      isOpen={isModalOpen}
      mode={'edit'}
      user={userdetail}
      onClose={handleClose}
      onSave={handleSaveUser}
    />
  );
}
