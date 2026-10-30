import { useRef, useState, type DragEvent } from 'react';

import { Check, Loader2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NetworkError } from '@/lib/api-utils';
import { Logger } from '@/lib/services/logger';
import { cn } from '@/lib/utils';

import { useImportUsfmMilestone } from '../hooks/useMilestones';
import { type ProjectDetails } from '../hooks/useProjectDetails';
import {
  type ListedUsfmFile,
  type UsfmFileError,
  useUsfmMilestoneFiles,
} from '../hooks/useUsfmMilestoneFiles';
import {
  checkMilestoneUsfmFiles,
  compareBibleOrder,
  UsfmImportConflictError,
  UsfmImportRejectedError,
} from '../lib/usfm-import';

/** The project the milestone goes into, shown read-only so the user can confirm it (#420). */
export type UsfmImportDestination = Pick<
  ProjectDetails,
  'name' | 'sourceLanguageName' | 'sourceName' | 'targetLanguageName'
>;

interface UsfmMilestoneImportTabProps {
  projectId: number;
  project: UsfmImportDestination;
  onCancel: () => void;
  /** Called once the milestone exists, to close the dialog. */
  onImported: () => void;
}

/** The red box the #418 mockup puts under the upload area, one per refused file. */
const ERROR_BOX =
  'flex items-start gap-2 rounded-sm border border-[#f5b5b5] bg-[#fde8e8] px-3.5 py-2.5 text-[13px] leading-normal text-[#b91c1c] dark:border-[#6b2b2b] dark:bg-[#3a1f1f] dark:text-[#f5a3a3]';

/** The error text the #418 spec gives for each refusal, naming the book where there is one. */
function useErrorMessage() {
  const { t } = useTranslation();
  return (error: UsfmFileError): string => {
    const book = error.bookName ?? '';
    switch (error.reason) {
      case 'USFM_INVALID':
        return t('errorNotValidUsfm');
      case 'USFM_BOOK_MISSING':
        return t('errorMissingBookData');
      case 'USFM_BOOK_DUPLICATE':
        return t('errorBookAlreadyAdded', { book });
      case 'USFM_BOOK_EXISTS':
        return error.milestoneName
          ? t('errorBookInMilestone', { book, milestone: error.milestoneName })
          : t('errorBookInProject', { book });
      case 'USFM_BOOK_NOT_IN_SOURCE':
        return t('errorBookNotInSourceBible', { book, bible: error.sourceBibleName ?? '' });
      case 'CHECK_NETWORK':
        return t('errorUsfmCheckNetwork');
      case 'CHECK_FAILED':
        return t('errorUsfmCheckFailed');
    }
  };
}

/**
 * The Add Milestone Import tab (#418, #420): the upload area, the files that passed, the
 * milestone name, the books they hold and the project they go into, on one screen.
 */
export function UsfmMilestoneImportTab({
  projectId,
  project,
  onCancel,
  onImported,
}: UsfmMilestoneImportTabProps) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [name, setName] = useState('');
  const { files, errors, checking, addFiles, refuse, removeFile, dismissError } =
    useUsfmMilestoneFiles(projectId);
  const importMilestone = useImportUsfmMilestone(projectId);

  const openFilePicker = () => inputRef.current?.click();

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving onto a child of the drop area also fires dragleave; only leaving the area counts.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingOver(false);
    }
  };

  const books = [...files]
    .sort((a, b) => compareBibleOrder(a.bookCode, b.bookCode))
    .map(file => file.bookName)
    .join(', ');

  const canImport =
    Boolean(name.trim()) && files.length > 0 && checking === 0 && !importMilestone.isPending;

  /**
   * The project gained one of the books after the upload check, so the import was refused as a
   * whole (409). Checking the files again names the book and takes its file off the list.
   */
  const showConflict = async (sent: ListedUsfmFile[]) => {
    try {
      const verdicts = await checkMilestoneUsfmFiles(
        projectId,
        sent.map(({ fileName, usfm }) => ({ fileName, usfm })),
        []
      );
      if (refuse(sent, verdicts) > 0) return;
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'usfm milestone import recheck',
      });
    }
    toast.error(t('milestoneImportFailed'));
  };

  const handleImport = async () => {
    if (!canImport) return;
    const sent = files;
    try {
      await importMilestone.mutateAsync({
        name: name.trim(),
        files: sent.map(({ fileName, usfm }) => ({ fileName, usfm })),
      });
      toast.success(t('milestoneCreated'));
      onImported();
    } catch (error) {
      if (error instanceof UsfmImportRejectedError) {
        if (refuse(sent, error.verdicts) > 0) return;
      } else if (error instanceof UsfmImportConflictError) {
        await showConflict(sent);
        return;
      }
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'usfm milestone import',
      });
      toast.error(
        t(error instanceof NetworkError ? 'errorImportNetwork' : 'milestoneImportFailed')
      );
    }
  };

  return (
    <div className='grid gap-4 py-4'>
      {/* The whole area opens the picker, as in the mockup; the button is the visible cue. */}
      <div
        className={cn(
          'bg-background hover:border-primary hover:bg-muted cursor-pointer rounded-sm border-2 border-dashed px-5 py-6 text-center transition-colors',
          isDraggingOver ? 'border-primary bg-muted' : 'border-border'
        )}
        data-testid='usfm-drop-area'
        onClick={openFilePicker}
        onDragLeave={handleDragLeave}
        onDragOver={event => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDrop={handleDrop}
      >
        <Upload aria-hidden className='text-muted-foreground mx-auto mb-2 h-7 w-7' />
        <p className='text-foreground text-sm leading-normal'>
          <strong className='font-semibold'>{t('uploadUsfmFiles')}</strong>
          <br />
          {t('dropUsfmFiles')}
        </p>
        <Button
          className='hover:border-primary hover:text-primary mt-3.5 h-auto px-4 py-1.5 text-[13px] font-semibold'
          type='button'
          variant='outline'
          onClick={event => {
            event.stopPropagation();
            openFilePicker();
          }}
        >
          {t('selectFile')}
        </Button>
        <p className='text-muted-foreground mt-2.5 text-xs'>{t('usfmOnlyFormat')}</p>
        <input
          ref={inputRef}
          multiple
          className='hidden'
          data-testid='usfm-file-input'
          type='file'
          onChange={event => {
            const picked = Array.from(event.target.files ?? []);
            // Clearing the value is what lets the same filename be picked twice. Without it the
            // browser sees no change on the second pick, so a corrected file cannot be retried.
            event.target.value = '';
            void addFiles(picked);
          }}
          onClick={event => event.stopPropagation()}
        />
      </div>

      {checking > 0 && (
        <p className='text-muted-foreground flex items-center gap-2 text-[13px]'>
          <Loader2 aria-hidden className='h-4 w-4 animate-spin' />
          {t('checkingUsfmFiles')}
        </p>
      )}

      {errors.length > 0 && (
        <div className='grid gap-2' data-testid='usfm-file-errors'>
          {errors.map(error => (
            <div key={error.id} className={ERROR_BOX} role='alert'>
              <p className='min-w-0 flex-1 break-words'>
                <strong className='font-semibold'>{error.fileName}:</strong> {errorMessage(error)}
              </p>
              <button
                aria-label={t('dismissUsfmError', { fileName: error.fileName })}
                className='shrink-0 opacity-80 hover:opacity-100'
                type='button'
                onClick={() => dismissError(error.id)}
              >
                <X aria-hidden className='h-4 w-4' />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className='grid gap-1.5' data-testid='usfm-listed-files'>
          {files.map(file => (
            <li key={file.id} className='flex min-w-0 items-center gap-1.5 text-[13px]'>
              <Check
                aria-hidden
                className='h-3.5 w-3.5 shrink-0 text-(--success)'
                strokeWidth={2.5}
              />
              <span className='min-w-0 flex-1 truncate font-semibold text-(--success)'>
                {file.fileName}
              </span>
              <button
                aria-label={t('removeUsfmFile', { fileName: file.fileName })}
                className='text-muted-foreground hover:text-foreground shrink-0'
                type='button'
                onClick={() => removeFile(file.id)}
              >
                <X aria-hidden className='h-4 w-4' />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className='grid gap-2'>
        <Label htmlFor='usfm-milestone-name'>
          <span className='text-destructive'>*</span>
          {t('milestoneName')}
        </Label>
        <Input
          id='usfm-milestone-name'
          placeholder={t('milestoneNamePlaceholder')}
          value={name}
          onChange={event => setName(event.target.value)}
        />
      </div>

      {/* The books come from the files, so Book(s) is read-only and follows the list (#420). */}
      <div className='grid gap-2'>
        <Label htmlFor='usfm-milestone-books'>{t('importBooks')}</Label>
        <Input
          readOnly
          className='bg-muted focus-visible:ring-0'
          id='usfm-milestone-books'
          value={books}
        />
      </div>

      <dl
        className='grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-md border px-3.5 py-3 text-[13px]'
        data-testid='usfm-import-destination'
      >
        <dt className='text-muted-foreground font-medium'>{t('project')}</dt>
        <dd className='min-w-0 break-words'>{project.name}</dd>
        <dt className='text-muted-foreground font-medium'>{t('sourceLanguage')}</dt>
        <dd className='min-w-0 break-words'>{project.sourceLanguageName}</dd>
        <dt className='text-muted-foreground font-medium'>{t('sourceBible')}</dt>
        <dd className='min-w-0 break-words'>{project.sourceName}</dd>
        <dt className='text-muted-foreground font-medium'>{t('targetLanguage')}</dt>
        <dd className='min-w-0 break-words'>{project.targetLanguageName}</dd>
      </dl>

      <div className='flex justify-end gap-3 pt-2'>
        <Button disabled={importMilestone.isPending} variant='outline' onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button disabled={!canImport} onClick={() => void handleImport()}>
          {importMilestone.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {t('importMilestone')}
        </Button>
      </div>
    </div>
  );
}
