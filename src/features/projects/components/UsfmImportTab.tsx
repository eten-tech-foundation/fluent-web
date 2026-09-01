import { useCallback, useRef, useState, type DragEvent } from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { validateUsfmFile } from '../lib/usfm-validate';

/** A file that passed validation, with the book code detected from its markers. */
export interface AcceptedUsfmFile {
  file: File;
  bookCode: string;
}

interface UsfmImportTabProps {
  /**
   * Called with the whole batch once every file in it validates. #420 is what fills in the
   * project fields from here; until then the dialog has nothing to do with the result.
   */
  onFilesAccepted: (files: AcceptedUsfmFile[]) => void;
}

type ErrorKey = 'errorNotValidUsfm' | 'errorMissingBookData' | 'errorDuplicateBook';

export function UsfmImportTab({ onFilesAccepted }: UsfmImportTabProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [accepted, setAccepted] = useState<AcceptedUsfmFile[]>([]);
  const [error, setError] = useState<ErrorKey | null>(null);

  /**
   * #418 rejects the entire import if any single file fails, so nothing is kept unless the
   * whole batch passes — that is why the accepted list is cleared before every early return
   * rather than left holding the files from a previous drop.
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
      onFilesAccepted(results);
    },
    [onFilesAccepted]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void handleFiles(Array.from(event.dataTransfer.files));
  };

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

      {accepted.length > 0 && (
        <ul className='space-y-1'>
          {accepted.map(item => (
            <li key={item.file.name} className='flex justify-between text-sm'>
              <span className='truncate'>{item.file.name}</span>
              <span className='text-muted-foreground font-medium'>{item.bookCode}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
