import { useState } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { UserModal } from '@/components/UserModal';
import { useRefreshUserDetail } from '@/hooks/useRefreshUserDetail';
import { useUpdateUser } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

interface EditProfileProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function EditProfile({ isOpen, onClose }: EditProfileProps) {
  const { t } = useTranslation();
  const { userdetail } = useAppStore();
  const updateUserMutation = useUpdateUser();
  const { refreshAsync: refreshUserDetail } = useRefreshUserDetail();
  const [saveError, setSaveError] = useState<string | null>(null);

  const isModalOpen = isOpen ?? true;
  const handleClose = () => {
    setSaveError(null);
    // React Query keeps mutation errors until reset — without this a failed
    // save would resurface as mutationError in the next dialog.
    updateUserMutation.reset();
    (onClose ?? (() => window.history.back()))();
  };

  const handleSaveUser = async (userData: User | Omit<User, 'id'>): Promise<void> => {
    setSaveError(null);
    try {
      await updateUserMutation.mutateAsync({
        userData: userData as User,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('profileUpdateFailed'));
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to update user profile',
      });
      // Rethrow so UserModal can run its own failure handling.
      throw error;
    }

    // PATCH /users/:id returns no grants or role — rebuilding userdetail from
    // it zeroes the store's grants, which flips every route guard to '/'.
    // Resync from GET (which attaches orgGrants) instead; a failed resync
    // leaves the pre-save detail in place and self-heals on next focus.
    try {
      await refreshUserDetail();
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to refresh user details after profile save',
      });
    }

    toast.success(t('profileUpdated'));
    handleClose();
  };

  return (
    <UserModal
      error={saveError ?? updateUserMutation.error?.message}
      isLoading={updateUserMutation.isPending}
      isOpen={isModalOpen}
      mode={'edit'}
      roleField='hidden'
      user={userdetail}
      onClose={handleClose}
      onSave={handleSaveUser}
    />
  );
}
