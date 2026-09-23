import { useMemo, useState } from 'react';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { BibleBookMultiSelectPopover } from '@/components/BookSelector';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBibleBooks } from '@/features/projects/hooks/useBibleBooks';
import { useCreateMilestone, useGetMilestones } from '@/features/projects/hooks/useMilestones';

interface AddMilestoneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  sourceBible?: number;
}

export const AddMilestoneDialog: React.FC<AddMilestoneDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  sourceBible,
}) => {
  const [name, setName] = useState('');
  const [books, setBooks] = useState<number[]>([]);

  const { data: availableBooks, isLoading: booksLoading } = useBibleBooks(sourceBible ?? null);
  const { data: milestones } = useGetMilestones(projectId);
  const createMilestone = useCreateMilestone(projectId);

  const bookMilestoneMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (!milestones) return map;
    for (const milestone of milestones) {
      for (const bookId of milestone.bookIds) {
        map[bookId] = milestone.name;
      }
    }
    return map;
  }, [milestones]);

  const handleSubmit = async () => {
    if (!name.trim() || books.length === 0 || !sourceBible) return;

    try {
      await createMilestone.mutateAsync({
        name: name.trim(),
        bookIds: books,
      });
      toast.success('Milestone created successfully');
      setName('');
      setBooks([]);
      onClose();
    } catch {
      toast.error('Failed to create milestone');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>Add Milestone</DialogTitle>
        </DialogHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid gap-2'>
            <Label>
              <span className='text-destructive'>*</span>
              Milestone Name
            </Label>
            <Input
              placeholder='e.g. Gospels Phase 1'
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label>
              <span className='text-destructive'>*</span>
              Select Books
            </Label>
            {booksLoading ? (
              <div className='flex items-center gap-2 rounded-md border p-3'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Loading books...</span>
              </div>
            ) : (
              <BibleBookMultiSelectPopover
                bookMilestoneMap={bookMilestoneMap}
                books={availableBooks ?? []}
                disabled={!sourceBible}
                value={books}
                onChange={setBooks}
              />
            )}
          </div>
        </div>
        <div className='flex justify-end gap-3'>
          <Button disabled={createMilestone.isPending} variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || books.length === 0 || createMilestone.isPending}
            onClick={handleSubmit}
          >
            {createMilestone.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Add Milestone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
