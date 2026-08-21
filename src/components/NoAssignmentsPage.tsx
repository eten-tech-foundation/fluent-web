import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const NoAssignmentsPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 text-center'>
      <FolderOpen className='text-muted-foreground h-16 w-16' strokeWidth={1.5} />
      <h2 className='text-foreground text-xl font-semibold'>
        {t('noAssignments.title', 'No Project Assignments Yet')}
      </h2>
      <p className='text-muted-foreground max-w-sm text-sm'>
        {t(
          'noAssignments.description',
          "You're a member of this organization but haven't been assigned to any projects yet. Contact your project manager to get started."
        )}
      </p>
    </div>
  );
};
