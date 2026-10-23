import { useRef, useState, type DragEvent } from 'react';

import { Check, Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { type AcceptedUsfmFile, useUsfmImportFiles } from '../hooks/useUsfmImportFiles';
import { type UsfmFileProblem } from '../lib/usfm-check';

import { CreateProjectError } from './CreateProjectError';
import { ProjectFormFields, type ProjectFormData } from './ProjectFormFields';

interface UsfmImportTabProps {
  formData: ProjectFormData;
  onFieldChange: <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => void;
  onBooksChange: (books: number[]) => void;
  /** Create the project from these files plus the fields (#419). */
  onSubmit: (files: AcceptedUsfmFile[]) => void;
  isSubmitting?: boolean;
  /** Why the last Create Project failed, if it did (#419, #420). */
  createError?: Error | null;
}

const PROBLEM_MESSAGES = {
  USFM_INVALID: 'errorNotValidUsfm',
  USFM_BOOK_MISSING: 'errorMissingBookData',
  USFM_BOOK_DUPLICATE: 'errorDuplicateBook',
} as const satisfies Record<UsfmFileProblem, string>;

/** The red box the #418 mockup puts under the upload area, one line per problem. */
const ERROR_BOX =
  'mt-3.5 rounded-sm border border-[#f5b5b5] bg-[#fde8e8] px-3.5 py-2.5 text-[13px] leading-normal text-[#b91c1c] dark:border-[#6b2b2b] dark:bg-[#3a1f1f] dark:text-[#f5a3a3]';

export function UsfmImportTab({
  formData,
  onFieldChange,
  onSubmit,
  isSubmitting = false,
  createError = null,
}: UsfmImportTabProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Kept in the tab on purpose: leaving for New and coming back starts the upload over, which
  // the PM accepted on #418.
  const { state: importState, selectFiles } = useUsfmImportFiles();

  const openFilePicker = () => inputRef.current?.click();

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    void selectFiles(Array.from(event.dataTransfer.files));
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving onto a child of the drop area also fires dragleave; only leaving the area counts.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingOver(false);
    }
  };

  // Before the files pass, the tab is the upload area (#418); afterwards the fields replace it,
  // with no way back except closing the dialog (#420).
  if (importState.status !== 'accepted') {
    const fileNames = importState.status === 'idle' ? [] : importState.fileNames;

    return (
      <div className='py-6'>
        {/* The whole area opens the picker, as in the mockup; the button is the visible cue. */}
        <div
          className={cn(
            'bg-background hover:border-primary hover:bg-muted cursor-pointer rounded-sm border-2 border-dashed px-5 py-8 text-center transition-colors',
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
            {t('selectFiles')}
          </Button>
          <p className='text-muted-foreground mt-2.5 text-xs'>{t('usfmOnlyFormat')}</p>
          <input
            ref={inputRef}
            multiple
            className='hidden'
            data-testid='usfm-file-input'
            type='file'
            onChange={event => {
              const files = Array.from(event.target.files ?? []);
              // Clearing the value is what lets the same filename be picked twice. Without it the
              // browser sees no change on the second pick, so a corrected file cannot be retried.
              event.target.value = '';
              void selectFiles(files);
            }}
            onClick={event => event.stopPropagation()}
          />
        </div>

        {fileNames.length > 0 && (
          <div
            className='bg-background text-foreground mt-3.5 flex items-center gap-2 rounded-sm border px-3 py-2 text-[13px]'
            data-testid='selected-files'
          >
            {fileNames.length === 1
              ? fileNames[0]
              : t('usfmFilesSelected', { count: fileNames.length })}
          </div>
        )}

        {importState.status === 'checking' && (
          <p className='text-muted-foreground mt-3.5 flex items-center gap-2 text-[13px]'>
            <Loader2 aria-hidden className='h-4 w-4 animate-spin' />
            {t('checkingUsfmFiles')}
          </p>
        )}

        {importState.status === 'rejected' && (
          <div className={ERROR_BOX} data-testid='usfm-file-errors' role='alert'>
            {importState.problems.map(({ fileName, problem }, index) => (
              <p key={`${fileName}-${index}`}>
                {fileName}: {t(PROBLEM_MESSAGES[problem])}
              </p>
            ))}
          </div>
        )}

        {importState.status === 'failed' && (
          <div className={ERROR_BOX} data-testid='usfm-file-errors' role='alert'>
            <p>
              {t(
                importState.reason === 'network' ? 'errorUsfmCheckNetwork' : 'errorUsfmCheckFailed'
              )}
            </p>
          </div>
        )}
      </div>
    );
  }

  const accepted = importState.files;

  /**
   * #420's rule plus the fields a project cannot exist without: Book(s) comes from the files
   * rather than a picker, and every field the modal's submit guard checks is named here, so the
   * button cannot light up on a form the modal would then refuse silently. Source Language is
   * already implied by Source Bible, which is gated on it, but listing it keeps the enable rule
   * and the guard from drifting apart.
   */
  const canSubmit =
    Boolean(formData.title.trim()) &&
    Boolean(formData.sourceLanguage) &&
    Boolean(formData.sourceBible) &&
    Boolean(formData.targetLanguage) &&
    Boolean(formData.pericopeSetId) &&
    accepted.length > 0;

  /*
    The books the API found in the files (#418), named in file order and read-only: the server
    derives the project's books from the files. A file named for one book that holds another
    (1CH.usfm with \id GEN) shows up here as the book it really is (#419).
  */
  const booksField = (
    <div className='space-y-2'>
      <Label>{t('importBooks')}</Label>
      <div
        className='bg-muted text-foreground rounded-sm border px-3 py-2 text-sm'
        data-testid='import-books'
      >
        {accepted.map(item => item.bookName).join(', ')}
      </div>
    </div>
  );

  return (
    <div className='space-y-6 py-6'>
      <ul className='space-y-1' data-testid='accepted-files'>
        {accepted.map(item => (
          <li
            key={item.bookCode}
            className='flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-(--success)'
          >
            <Check aria-hidden className='h-3.5 w-3.5 shrink-0' strokeWidth={2.5} />
            <span className='truncate'>{item.file.name}</span>
          </li>
        ))}
      </ul>

      <ProjectFormFields
        booksField={booksField}
        formData={formData}
        onFieldChange={onFieldChange}
      />

      {createError && !isSubmitting && <CreateProjectError error={createError} />}

      <div className='flex items-center justify-between pt-4'>
        <p className='flex items-center gap-2 text-sm font-medium text-(--success)'>
          <Check className='h-4 w-4' />
          {t('usfmFilesValidated')}
        </p>

        <Button
          className='bg-primary hover:bg-primary/90 text-primary-foreground hover:cursor-pointer'
          disabled={!canSubmit || isSubmitting}
          type='button'
          onClick={() => onSubmit(accepted)}
        >
          {isSubmitting ? (
            <div className='flex items-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span>Creating...</span>
            </div>
          ) : (
            t('createProject')
          )}
        </Button>
      </div>
    </div>
  );
}
