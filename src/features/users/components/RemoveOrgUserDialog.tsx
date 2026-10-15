import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChapterAssignmentsByUserId } from '@/hooks/useChapterAssignment';
import { type User } from '@/lib/types';

interface RemoveOrgUserDialogProps {
  /** The removal target; the dialog renders only while one is set. */
  user: User | null;
  orgId: number | null;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for removing a user from the organization. Shows the
 * "chapter assignments will be removed" warning only when the user actually
 * holds assignments in this org.
 */
export const RemoveOrgUserDialog: React.FC<RemoveOrgUserDialogProps> = ({
  user,
  orgId,
  pending,
  error,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const {
    data: assignments,
    isError: assignmentsError,
    refetch,
  } = useChapterAssignmentsByUserId(user?.id ?? 0, orgId);

  const hasAssignments =
    (assignments?.assignedChapters.length ?? 0) + (assignments?.peerCheckChapters.length ?? 0) > 0;

  if (!user) return null;

  return (
    <Dialog open onOpenChange={open => !open && onCancel()}>
      <DialogContent className='sm:max-w-[425px]' onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('removeUserFromOrg')}</DialogTitle>
          <DialogDescription>
            {t('removeFromOrgConfirm', { name: user.username })}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-2 text-sm'>
          {hasAssignments && (
            <p className='font-medium text-[#7C2D12] dark:text-amber-300'>
              {t('assignmentsWillBeRemoved')}
            </p>
          )}
          {error && <p className='font-medium text-red-600'>{error}</p>}
          {assignmentsError && (
            <p className='text-red-600'>
              {t('assignmentsLoadFailed')}{' '}
              <button
                className='font-semibold underline underline-offset-2'
                type='button'
                onClick={() => void refetch()}
              >
                {t('retry')}
              </button>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button disabled={pending} variant='outline' onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button disabled={pending || !assignments} variant='destructive' onClick={onConfirm}>
            {pending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
