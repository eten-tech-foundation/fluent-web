import { useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Headphones, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { BibleBookMultiSelectPopover } from '@/components/BookSelector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBibleBooks } from '@/features/projects/hooks/useBibleBooks';
import { bookDetailsQueryKey, useBookDetails } from '@/features/projects/hooks/useBookDetails';
import { useGetMilestones, useUpdateMilestone } from '@/features/projects/hooks/useMilestones';

interface ManageMilestoneBooksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  milestoneId: number;
  sourceBibleId: number;
}

export const ManageMilestoneBooksDialog: React.FC<ManageMilestoneBooksDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  milestoneId,
  sourceBibleId,
}) => {
  const queryClient = useQueryClient();
  const [pendingBookId, setPendingBookId] = useState<number | null>(null);
  const [booksToAdd, setBooksToAdd] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const { data: books, isLoading: booksLoading } = useBookDetails(milestoneId, isOpen);
  const { data: bibleBooks } = useBibleBooks(isOpen ? sourceBibleId : null);
  const { data: milestones } = useGetMilestones(projectId);
  const updateMilestone = useUpdateMilestone(projectId);

  const audioByBookId = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const b of bibleBooks ?? []) map.set(b.bookId, !!b.hasAudio);
    return map;
  }, [bibleBooks]);

  const otherMilestones = (milestones ?? []).filter(m => m.id !== milestoneId);

  const bookMilestoneMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (!milestones) return map;
    for (const m of milestones) {
      if (m.id === milestoneId) continue;
      for (const bookId of m.bookIds) {
        map[bookId] = m.name;
      }
    }
    return map;
  }, [milestones, milestoneId]);

  // Exclude books already in THIS milestone from the available list
  const availableBooks = useMemo(() => {
    if (!bibleBooks || !books) return [];
    const currentBookIds = new Set(books.map(b => b.bookId));
    return bibleBooks.filter(b => !currentBookIds.has(b.bookId));
  }, [bibleBooks, books]);

  const invalidateRelated = () => {
    void queryClient.invalidateQueries({ queryKey: ['chapterAssignments'] });
    void queryClient.invalidateQueries({ queryKey: ['project-unit-books'] });
    void queryClient.invalidateQueries({ queryKey: bookDetailsQueryKey(milestoneId) });
  };

  const handleMove = async (bookId: number, targetMilestoneId: number, bookName: string) => {
    setPendingBookId(bookId);
    try {
      await updateMilestone.mutateAsync({
        id: milestoneId,
        moveBooks: [{ bookId, targetMilestoneId }],
      });
      invalidateRelated();
      toast.success(`${bookName} moved to the selected milestone`);
    } catch {
      toast.error(`Failed to move ${bookName}`);
    } finally {
      setPendingBookId(null);
    }
  };

  const handleRemove = async (bookId: number, bookName: string) => {
    if (
      !window.confirm(
        `Remove "${bookName}" from this milestone? Its translation progress is kept and isn't deleted — you can add it back later if needed.`
      )
    ) {
      return;
    }

    setPendingBookId(bookId);
    try {
      await updateMilestone.mutateAsync({ id: milestoneId, removeBooks: [bookId] });
      invalidateRelated();
      toast.success(`${bookName} removed from milestone`);
    } catch {
      toast.error(`Failed to remove ${bookName}`);
    } finally {
      setPendingBookId(null);
    }
  };

  const handleAddBooks = async () => {
    if (booksToAdd.length === 0) return;
    setIsAdding(true);

    try {
      const moveBooksPayload: Array<{ bookId: number; targetMilestoneId: number }> = [];
      const addBooksPayload: number[] = [];

      for (const bookId of booksToAdd) {
        // If the book is in another milestone, it's a move. Otherwise, it's an add.
        const existingMilestoneName = bookMilestoneMap[bookId];
        if (existingMilestoneName) {
          moveBooksPayload.push({ bookId, targetMilestoneId: milestoneId });
        } else {
          addBooksPayload.push(bookId);
        }
      }

      await updateMilestone.mutateAsync({
        id: milestoneId,
        bibleId: sourceBibleId,
        addBooks: addBooksPayload.length > 0 ? addBooksPayload : undefined,
        moveBooks: moveBooksPayload.length > 0 ? moveBooksPayload : undefined,
      });

      invalidateRelated();
      setBooksToAdd([]);
      toast.success('Books added successfully');
    } catch {
      toast.error('Failed to add books');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='gap-0 overflow-hidden p-0 sm:max-w-[500px]'>
        <DialogHeader className='border-border border-b px-6 py-4'>
          <DialogTitle>Manage Books</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 px-6 py-4'>
          <div className='flex items-center gap-2'>
            <BibleBookMultiSelectPopover
              bookMilestoneMap={bookMilestoneMap}
              books={availableBooks}
              disabled={!sourceBibleId}
              placeholder='Add books...'
              value={booksToAdd}
              onChange={setBooksToAdd}
            />
            <Button disabled={booksToAdd.length === 0 || isAdding} onClick={handleAddBooks}>
              {isAdding && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Add
            </Button>
          </div>

          <div className='space-y-2'>
            <p className='text-foreground text-sm font-bold'>Books in this Milestone</p>

            <div className='divide-border border-border max-h-[400px] divide-y overflow-y-auto rounded-lg border'>
              {booksLoading ? (
                <div className='text-muted-foreground flex items-center gap-2 p-4 text-sm'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span>Loading books...</span>
                </div>
              ) : !books || books.length === 0 ? (
                <p className='text-muted-foreground p-4 text-sm'>No books in this milestone.</p>
              ) : (
                books.map(book => {
                  const isRowPending = pendingBookId === book.bookId && updateMilestone.isPending;
                  const hasAudio = audioByBookId.get(book.bookId) ?? false;

                  return (
                    <div
                      key={book.bookId}
                      className='bg-background flex items-center justify-between gap-3 p-4'
                    >
                      <div className='flex items-center gap-2 overflow-hidden'>
                        <span className='text-foreground truncate text-base'>{book.bookName}</span>
                        {hasAudio && (
                          <Badge
                            className='bg-success/15 text-success hover:bg-success/20 shrink-0 gap-1 border-0 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase shadow-none'
                            variant='outline'
                          >
                            <Headphones className='h-3 w-3' />
                            Audio
                          </Badge>
                        )}
                      </div>

                      <div className='flex shrink-0 items-center gap-2'>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              className='data-[state=open]:border-primary data-[state=open]:ring-ring flex items-center gap-1 data-[state=open]:ring-1'
                              disabled={
                                otherMilestones.length === 0 || pendingBookId === book.bookId
                              }
                              size='sm'
                              variant='outline'
                            >
                              {isRowPending ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Move'}
                              <ChevronDown className='h-3.5 w-3.5 opacity-70' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            {otherMilestones.map(milestone => (
                              <DropdownMenuItem
                                key={milestone.id}
                                onSelect={() =>
                                  void handleMove(book.bookId, milestone.id, book.bookName)
                                }
                              >
                                {milestone.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          aria-label={`Remove ${book.bookName} from milestone`}
                          className='text-muted-foreground hover:text-destructive h-9 w-9'
                          disabled={pendingBookId === book.bookId}
                          size='icon'
                          variant='ghost'
                          onClick={() => void handleRemove(book.bookId, book.bookName)}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className='border-border border-t px-6 py-4 sm:justify-end'>
          <Button variant='outline' onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
