import { useCallback, useRef, useState, type DragEvent } from 'react';

import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { validateUsfmFile } from '../lib/usfm-validate';

import { ProjectFormFields, type ProjectFormData } from './ProjectFormFields';

/** A file that passed validation, with the book code detected from its markers. */
export interface AcceptedUsfmFile {
  file: File;
  bookCode: string;
}

interface UsfmImportTabProps {
  formData: ProjectFormData;
  onFieldChange: <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => void;
  onBooksChange: (books: number[]) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  /** Called with the whole batch once every file in it validates. */
  onFilesAccepted?: (files: AcceptedUsfmFile[]) => void;
}

type ErrorKey = 'errorNotValidUsfm' | 'errorMissingBookData' | 'errorDuplicateBook';

export function UsfmImportTab({
  formData,
  onFieldChange,
  onBooksChange,
  onSubmit,
  isSubmitting = false,
  onFilesAccepted,
}: UsfmImportTabProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [accepted, setAccepted] = useState<AcceptedUsfmFile[]>([]);
  const [error, setError] = useState<ErrorKey | null>(null);

  /**
   * #418 rejects the entire import if any single file fails, so nothing is kept unless the whole
   * batch passes — hence clearing the accepted list before every early return rather than leaving
   * it holding files from a previous attempt.
   */
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const results: AcceptedUsfmFile[] = [];
      const seen = new Set<string>();

      for (const file of files) {
        const result = validateUsfmFile(await file.text());

        if (!result.ok) {
          setAccepted([]);
          setError(result.reason === 'not-usfm' ? 'errorNotValidUsfm' : 'errorMissingBookData');
          return;
        }

        // One file per book, so a second file claiming a book we already have is a mistake
        // rather than something to silently pick a winner for.
        if (seen.has(result.bookCode)) {
          setAccepted([]);
          setError('errorDuplicateBook');
          return;
        }

        seen.add(result.bookCode);
        results.push({ file, bookCode: result.bookCode });
      }

      setError(null);
      setAccepted(results);
      onFilesAccepted?.(results);
    },
    [onFilesAccepted]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  /**
   * #420's rule, which is not the New tab's: Book(s) comes from the files rather than a picker,
   * and Pericope Set is not part of it.
   */
  const canSubmit =
    Boolean(formData.title.trim()) &&
    Boolean(formData.sourceBible) &&
    Boolean(formData.targetLanguage) &&
    accepted.length > 0;

  // Before any file is accepted the tab is only the upload area; afterwards it is replaced by the
  // fields, with no way back except closing the dialog (#420).
  if (accepted.length === 0) {
    return (
      <div className='space-y-4 py-6'>
        <div
          className='border-muted-foreground/30 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-10'
          data-testid='usfm-drop-area'
          onDragOver={event => event.preventDefault()}
          onDrop={handleDrop}
        >
          <Button type='button' variant='outline' onClick={() => inputRef.current?.click()}>
            {t('selectFile')}
          </Button>
          <p className='text-muted-foreground text-sm'>{t('dropUsfmFiles')}</p>
          <input
            ref={inputRef}
            multiple
            className='hidden'
            data-testid='usfm-file-input'
            type='file'
            onChange={event => void handleFiles(Array.from(event.target.files ?? []))}
          />
        </div>

        {error && <p className='text-destructive text-sm font-medium'>{t(error)}</p>}
      </div>
    );
  }

  return (
    <div className='space-y-6 py-6'>
      <ul className='space-y-1' data-testid='accepted-files'>
        {accepted.map(item => (
          <li key={item.file.name} className='flex items-center gap-2 text-sm text-(--success)'>
            <Check className='h-4 w-4' />
            <span className='truncate'>{item.file.name}</span>
          </li>
        ))}
      </ul>

      <ProjectFormFields
        detectedBookCodes={accepted.map(item => item.bookCode)}
        formData={formData}
        onBooksChange={onBooksChange}
        onFieldChange={onFieldChange}
      />

      <div className='flex items-center justify-between pt-4'>
        <p className='flex items-center gap-2 text-sm font-medium text-(--success)'>
          <Check className='h-4 w-4' />
          {t('usfmFilesValidated')}
        </p>

        <Button
          className='bg-primary hover:bg-primary/90 text-primary-foreground hover:cursor-pointer'
          disabled={!canSubmit || isSubmitting}
          type='button'
          onClick={onSubmit}
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
