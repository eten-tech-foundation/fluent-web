import { useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { BibleBookMultiSelectPopover } from '@/components/BookSelector';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useBibleBooks } from '@/features/projects/hooks/useBibleBooks';
import { useUpdateMilestone } from '@/features/projects/hooks/useMilestones';

interface ManageMilestoneBooksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  milestoneId: number;
  sourceBibleId: number;
  initialSelectedBookIds: number[];
}

export const ManageMilestoneBooksDialog: React.FC<ManageMilestoneBooksDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  milestoneId,
  sourceBibleId,
  initialSelectedBookIds,
}) => {
  const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setSelectedBooks(initialSelectedBookIds);
    }
  }, [isOpen, initialSelectedBookIds]);

  const { data: availableBooks, isLoading: booksLoading } = useBibleBooks(sourceBibleId);
  const updateMilestone = useUpdateMilestone(projectId);

  const handleSubmit = async () => {
    try {
      const initialSet = new Set(initialSelectedBookIds);
      const currentSet = new Set(selectedBooks);

      const addBooks = selectedBooks.filter(id => !initialSet.has(id));
      const removeBooks = initialSelectedBookIds.filter(id => !currentSet.has(id));

      if (addBooks.length === 0 && removeBooks.length === 0) {
        onClose();
        return;
      }

      if (removeBooks.length > 0) {
        if (
          !window.confirm(
            'Removing books will permanently delete their chapter assignments and translation progress. Are you sure you want to proceed?'
          )
        ) {
          return;
        }
      }

      await updateMilestone.mutateAsync({
        id: milestoneId,
        bibleId: sourceBibleId,
        addBooks: addBooks.length > 0 ? addBooks : undefined,
        removeBooks: removeBooks.length > 0 ? removeBooks : undefined,
      });

      // Invalidate related caches so the UI reflects the changes immediately
      void queryClient.invalidateQueries({ queryKey: ['chapterAssignments'] });
      void queryClient.invalidateQueries({ queryKey: ['project-unit-books'] });

      toast.success('Milestone books updated successfully');
      onClose();
    } catch {
      toast.error('Failed to update milestone books');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>Manage Milestone Books</DialogTitle>
        </DialogHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid gap-2'>
            <Label>Select Books</Label>
            {booksLoading ? (
              <div className='flex items-center gap-2 rounded-md border p-3'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Loading books...</span>
              </div>
            ) : (
              <BibleBookMultiSelectPopover
                books={availableBooks ?? []}
                disabled={!sourceBibleId}
                value={selectedBooks}
                onChange={setSelectedBooks}
              />
            )}
          </div>
        </div>
        <div className='flex justify-end gap-3'>
          <Button disabled={updateMilestone.isPending} variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={updateMilestone.isPending} onClick={handleSubmit}>
            {updateMilestone.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
