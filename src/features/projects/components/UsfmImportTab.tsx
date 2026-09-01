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

  /** Which selection is current. Reading a file is async, so an older batch can finish last. */
  const selectionRef = useRef(0);

  /**
   * #418 rejects the entire import if any single file fails, so nothing is kept unless the
   * whole batch passes — that is why the accepted list is cleared before every early return
   * rather than left holding the files from a previous drop.
   */
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const selection = ++selectionRef.current;
      const results: AcceptedUsfmFile[] = [];
      const seen = new Set<string>();

      for (const file of files) {
        const text = await file.text();

        // Someone selected again while this batch was still reading. The newer one wins, so
        // drop this batch instead of letting a stale result overwrite what is on screen.
        if (selection !== selectionRef.current) return;

        const result = validateUsfmFile(text);

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
          onChange={event => {
            const files = Array.from(event.target.files ?? []);
            // Clearing the value is what lets the same filename be picked twice. Without it the
            // browser sees no change on the second pick, so a corrected file cannot be retried.
            event.target.value = '';
            void handleFiles(files);
          }}
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
