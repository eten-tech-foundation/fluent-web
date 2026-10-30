import { useMemo, useState } from 'react';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { BibleBookMultiSelectPopover } from '@/components/BookSelector';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBibleBooks } from '@/features/projects/hooks/useBibleBooks';
import { useCreateMilestone, useGetMilestones } from '@/features/projects/hooks/useMilestones';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';

import { type UsfmImportDestination, UsfmMilestoneImportTab } from './UsfmMilestoneImportTab';

const LARGE_MILESTONE_BOOK_THRESHOLD = 5;

/** The #418 mockup's tabs: semibold, grey until active, then primary with a 2px underline. */
const TAB_TRIGGER =
  'text-muted-foreground hover:text-foreground data-[state=active]:text-primary after:bg-primary mr-5 flex-none px-1 text-sm font-semibold';

interface AddMilestoneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  sourceBible?: number;
  /** Shown read-only on the Import tab, so the user can confirm where the milestone goes (#420). */
  project: UsfmImportDestination;
}

export const AddMilestoneDialog: React.FC<AddMilestoneDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  sourceBible,
  project,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [books, setBooks] = useState<number[]>([]);
  const [tab, setTab] = useState('new');

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

  const handleClose = () => {
    setName('');
    setBooks([]);
    setTab('new');
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim() || books.length === 0 || !sourceBible) return;

    try {
      await createMilestone.mutateAsync({
        name: name.trim(),
        bookIds: books,
      });
      toast.success(t('milestoneCreated'));
      handleClose();
    } catch {
      toast.error(t('milestoneCreateFailed'));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent
        className={cn(
          'max-h-[90vh] overflow-x-hidden overflow-y-auto',
          config.features.usfmImport ? 'sm:max-w-[540px]' : 'sm:max-w-[425px]'
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('addMilestone')}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          {config.features.usfmImport && (
            // Underlined tabs in the primary color, as the #418 mockup draws them.
            <TabsList className='w-full justify-start border-b' variant='line'>
              <TabsTrigger className={TAB_TRIGGER} value='new'>
                {t('newTab')}
              </TabsTrigger>
              <TabsTrigger className={TAB_TRIGGER} value='import'>
                {t('importTab')}
              </TabsTrigger>
            </TabsList>
          )}
          <TabsContent value='new'>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label>
                  <span className='text-destructive'>*</span>
                  {t('milestoneName')}
                </Label>
                <Input
                  placeholder={t('milestoneNamePlaceholder')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label>
                  <span className='text-destructive'>*</span>
                  {t('selectBooks')}
                </Label>
                {booksLoading ? (
                  <div className='flex items-center gap-2 rounded-md border p-3'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    <span>{t('loadingBooks')}</span>
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
                {books.length > LARGE_MILESTONE_BOOK_THRESHOLD && (
                  <p
                    className='rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200'
                    role='status'
                  >
                    {t('largeMilestoneWarning')}
                  </p>
                )}
              </div>
            </div>
            <div className='flex justify-end gap-3'>
              <Button disabled={createMilestone.isPending} variant='outline' onClick={handleClose}>
                {t('cancel')}
              </Button>
              <Button
                disabled={!name.trim() || books.length === 0 || createMilestone.isPending}
                onClick={handleSubmit}
              >
                {createMilestone.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {t('save')}
              </Button>
            </div>
          </TabsContent>
          {config.features.usfmImport && (
            // Kept mounted, and only hidden, while New is showing, so a look at the New tab doesn't
            // drop the files. Closing the dialog unmounts it and starts the import over.
            <TabsContent forceMount hidden={tab !== 'import'} value='import'>
              <UsfmMilestoneImportTab
                project={project}
                projectId={projectId}
                onCancel={handleClose}
                onImported={handleClose}
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
