import { useMemo, useRef, useState } from 'react';

import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Headphones, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBibleBooks } from '@/features/projects/hooks/useBibleBooks';
import { bookDetailsQueryKey, useBookDetails } from '@/features/projects/hooks/useBookDetails';
import { useGetMilestones, useUpdateMilestone } from '@/features/projects/hooks/useMilestones';

import { wrapMilestoneName } from './TruncatedText';

interface MoveMilestoneMenuItemProps {
  milestone: { id: number; name: string };
  onSelect: () => void;
}

const MoveMilestoneMenuItem: React.FC<MoveMilestoneMenuItemProps> = ({ milestone, onSelect }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const lines = wrapMilestoneName(milestone.name);

  const handlePointerEnter = () => {
    const isEllipsed = ref.current
      ? ref.current.scrollWidth > ref.current.clientWidth || milestone.name.length > 25
      : milestone.name.length > 25;
    if (isEllipsed) {
      setIsOpen(true);
    }
  };

  const handlePointerLeave = () => {
    setIsOpen(false);
  };

  return (
    <DropdownMenuItem
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onSelect={onSelect}
    >
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <span ref={ref} className='block max-w-[200px] truncate'>
            {milestone.name}
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            className='max-w-[420px] text-xs font-normal break-words'
            side='bottom'
            sideOffset={6}
          >
            <div className='flex flex-col gap-0.5'>
              {lines.map((line, idx) => (
                <span key={idx} className='block'>
                  {line}
                </span>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </DropdownMenuItem>
  );
};

interface ManageMilestoneBooksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  milestoneId: number;
  sourceBibleId: number;
}

interface PendingRemoval {
  bookId: number;
  bookName: string;
}

export const ManageMilestoneBooksDialog: React.FC<ManageMilestoneBooksDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  milestoneId,
  sourceBibleId,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingBookId, setPendingBookId] = useState<number | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

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
      toast.success(t('milestoneBookMoved', { bookName }));
    } catch {
      toast.error(t('milestoneBookMoveFailed', { bookName }));
    } finally {
      setPendingBookId(null);
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemoval) return;
    const { bookId, bookName } = pendingRemoval;

    setPendingRemoval(null);
    setPendingBookId(bookId);
    try {
      await updateMilestone.mutateAsync({ id: milestoneId, removeBooks: [bookId] });
      invalidateRelated();
      toast.success(t('milestoneBookRemoved', { bookName }));
    } catch {
      toast.error(t('milestoneBookRemoveFailed', { bookName }));
    } finally {
      setPendingBookId(null);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className='gap-0 overflow-hidden p-0 sm:max-w-[500px]'>
          <DialogHeader className='border-border border-b px-6 py-4'>
            <DialogTitle>{t('manageBooks')}</DialogTitle>
          </DialogHeader>

          <div className='space-y-3 px-6 py-4'>
            <p className='text-foreground text-sm font-bold'>{t('booksInThisMilestone')}</p>

            <div className='divide-border border-border max-h-[400px] divide-y overflow-y-auto rounded-lg border'>
              {booksLoading ? (
                <div className='text-muted-foreground flex items-center gap-2 p-4 text-sm'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span>{t('loadingBooks')}</span>
                </div>
              ) : !books || books.length === 0 ? (
                <p className='text-muted-foreground p-4 text-sm'>{t('noBooksInMilestone')}</p>
              ) : (
                books.map(book => {
                  const isRowPending = pendingBookId === book.bookId && updateMilestone.isPending;
                  const hasAudio = audioByBookId.get(book.bookId) ?? false;

                  return (
                    <div
                      key={book.bookId}
                      className='bg-card flex items-center justify-between gap-3 p-4'
                    >
                      <div className='flex items-center gap-2 overflow-hidden'>
                        <span className='text-foreground truncate text-base'>{book.bookName}</span>
                        {hasAudio && (
                          <Badge
                            className='bg-success/15 text-success hover:bg-success/20 shrink-0 gap-1 border-0 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase shadow-none'
                            variant='outline'
                          >
                            <Headphones className='h-3 w-3' />
                            {t('audio')}
                          </Badge>
                        )}
                      </div>

                      <div className='flex shrink-0 items-center gap-2'>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              className='data-[state=open]:border-primary data-[state=open]:ring-ring flex items-center gap-1 data-[state=open]:ring-2 data-[state=open]:ring-offset-1'
                              disabled={
                                otherMilestones.length === 0 || pendingBookId === book.bookId
                              }
                              size='sm'
                              variant='outline'
                            >
                              {isRowPending ? (
                                <Loader2 className='h-4 w-4 animate-spin' />
                              ) : (
                                t('move')
                              )}
                              <ChevronDown className='h-3.5 w-3.5 opacity-70' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <TooltipProvider delayDuration={300}>
                              {otherMilestones.map(milestone => (
                                <MoveMilestoneMenuItem
                                  key={milestone.id}
                                  milestone={milestone}
                                  onSelect={() =>
                                    void handleMove(book.bookId, milestone.id, book.bookName)
                                  }
                                />
                              ))}
                            </TooltipProvider>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          aria-label={t('milestoneRemoveBookAriaLabel', {
                            bookName: book.bookName,
                          })}
                          className='text-muted-foreground hover:text-destructive h-9 w-9'
                          disabled={pendingBookId === book.bookId}
                          size='icon'
                          variant='ghost'
                          onClick={() =>
                            setPendingRemoval({ bookId: book.bookId, bookName: book.bookName })
                          }
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

          <DialogFooter className='border-border border-t px-6 py-4 sm:justify-end'>
            <Button variant='outline' onClick={onClose}>
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={open => !open && setPendingRemoval(null)}
      >
        <DialogContent className='sm:max-w-[420px]'>
          <DialogHeader>
            <DialogTitle>{t('removeBookConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className='text-muted-foreground text-sm'>
            {pendingRemoval &&
              t('removeBookConfirmDescription', { bookName: pendingRemoval.bookName })}
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setPendingRemoval(null)}>
              {t('cancel')}
            </Button>
            <Button variant='destructive' onClick={() => void confirmRemove()}>
              {t('remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
