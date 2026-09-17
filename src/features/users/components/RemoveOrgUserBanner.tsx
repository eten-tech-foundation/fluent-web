import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChapterAssignmentsByUserId } from '@/hooks/useChapterAssignment';
import { type User } from '@/lib/types';

interface RemoveOrgUserBannerProps {
  user: User;
  orgId: number | null;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Inline confirmation banner for removing a user from the organization —
 * mirrors the project-scoped remove banner in AssignProjectUsers. Shows the
 * "chapter assignments will be removed" warning only when the user actually
 * holds assignments in this org.
 */
export const RemoveOrgUserBanner: React.FC<RemoveOrgUserBannerProps> = ({
  user,
  orgId,
  pending,
  error,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { data: assignments, isPending: assignmentsLoading } = useChapterAssignmentsByUserId(
    user.id,
    orgId
  );

  const hasAssignments =
    (assignments?.assignedChapters.length ?? 0) + (assignments?.peerCheckChapters.length ?? 0) > 0;

  return (
    <div className='mb-4 shrink-0 rounded-xl border border-[#FCD34D] bg-[#FFF6D6] px-3.5 py-2 dark:border-amber-700/60 dark:bg-amber-950/40'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex flex-col text-[14px] leading-snug font-semibold text-[#7C2D12] dark:text-amber-300'>
          <span>{t('removeFromOrgConfirm', { name: user.username })}</span>
          {hasAssignments && <span>{t('assignmentsWillBeRemoved')}</span>}
          {error && <span className='text-red-600'>{error}</span>}
        </div>
        <div className='flex shrink-0 flex-col gap-1.5'>
          <Button
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90 h-7 rounded-md px-3 text-[13px] font-semibold'
            disabled={pending || assignmentsLoading}
            size='sm'
            onClick={onConfirm}
          >
            {pending ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : t('remove')}
          </Button>
          <Button
            className='border-border bg-background text-foreground hover:bg-muted h-7 rounded-md border px-3 text-[13px] font-semibold'
            disabled={pending}
            size='sm'
            variant='outline'
            onClick={onCancel}
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
};
