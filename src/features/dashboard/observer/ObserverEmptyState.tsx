import { FolderOpen } from 'lucide-react';

export const ObserverEmptyState: React.FC = () => {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 text-center'>
      <FolderOpen className='text-muted-foreground h-16 w-16' strokeWidth={1.5} />
      <p className='text-muted-foreground max-w-sm text-sm'>
        You have not been added to any projects yet.
      </p>
    </div>
  );
};
