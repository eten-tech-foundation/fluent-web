import { useEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type BookDetails,
  type BookDetailsPatch,
  TOC_FIELDS,
  type TocField,
  useBookDetails,
  useUpdateBookDetails,
} from '@/features/projects/hooks/useBookDetails';
import { Logger } from '@/lib/services/logger';

interface EditProjectMetadataDialogProps {
  isOpen: boolean;
  projectUnitId: number | null;
  onClose: () => void;
}

type TocValues = Record<TocField, string>;

/** Per-book user edits. A missing field means the input still shows the server value. */
type Drafts = Record<number, Partial<TocValues> | undefined>;

const TOC_FIELD_META: Record<
  TocField,
  { marker: string; labelKey: string; placeholderKey: string }
> = {
  tocLongName: {
    marker: '\\toc1',
    labelKey: 'bookLongName',
    placeholderKey: 'bookLongNamePlaceholder',
  },
  tocShortName: {
    marker: '\\toc2',
    labelKey: 'bookShortName',
    placeholderKey: 'bookShortNamePlaceholder',
  },
  tocAbbreviation: {
    marker: '\\toc3',
    labelKey: 'bookAbbreviation',
    placeholderKey: 'bookAbbreviationPlaceholder',
  },
};

/**
 * What the inputs show for a book as the server holds it. Short Name is seeded from the
 * legacy \mt title while no \toc2 exists (API contract); the other two are never seeded.
 */
const serverValues = (book: BookDetails): TocValues => ({
  tocLongName: book.tocLongName ?? '',
  tocShortName: book.tocShortName ?? book.bookTitle ?? '',
  tocAbbreviation: book.tocAbbreviation ?? '',
});

const inFlightKey = (bookId: number, field: TocField) => `${bookId}:${field}`;

export const EditProjectMetadataDialog: React.FC<EditProjectMetadataDialogProps> = ({
  isOpen,
  projectUnitId,
  onClose,
}) => {
  const { t } = useTranslation();
  const { data: books, isLoading, error } = useBookDetails(projectUnitId, isOpen);
  const updateBookDetails = useUpdateBookDetails();

  const [drafts, setDrafts] = useState<Drafts>({});
  const [openBooks, setOpenBooks] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mirror of the drafts state, because blur and close read and write it synchronously: a blur
  // and the close flush can land in the same tick, before React has re-rendered.
  const draftsRef = useRef<Drafts>({});
  const inFlightRef = useRef<Record<string, string>>({});
  const saveChainRef = useRef<Record<number, Promise<void>>>({});
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const valueOf = (book: BookDetails, field: TocField): string =>
    drafts[book.bookId]?.[field] ?? serverValues(book)[field];

  const setField = (bookId: number, field: TocField, value: string) => {
    draftsRef.current = {
      ...draftsRef.current,
      [bookId]: { ...draftsRef.current[bookId], [field]: value },
    };
    setDrafts(draftsRef.current);
  };

  /** Fields whose draft differs from the server value and is not already being saved. */
  const dirtyFields = (book: BookDetails, only?: TocField): BookDetailsPatch => {
    const draft = draftsRef.current[book.bookId];
    if (!draft) return {};

    const baseline = serverValues(book);
    const patch: BookDetailsPatch = {};
    for (const field of only ? [only] : TOC_FIELDS) {
      const raw = draft[field];
      if (raw === undefined) continue;
      const value = raw.trim();
      if (value === baseline[field]) continue;
      if (inFlightRef.current[inFlightKey(book.bookId, field)] === value) continue;
      patch[field] = value === '' ? null : value;
    }
    return patch;
  };

  /** Forget drafts the server now holds, unless the user kept typing meanwhile. */
  const settleDrafts = (bookId: number, patch: BookDetailsPatch) => {
    const draft = draftsRef.current[bookId];
    if (!draft) return;

    const remaining = { ...draft };
    for (const field of Object.keys(patch) as TocField[]) {
      if ((remaining[field] ?? '').trim() === (patch[field] ?? '')) delete remaining[field];
    }
    draftsRef.current = { ...draftsRef.current, [bookId]: remaining };
    setDrafts(draftsRef.current);
  };

  /**
   * A PATCH answers with the whole book row, so two saves for the same book must not overlap:
   * a late response would put back the value the newer save has already replaced, both in the
   * cache and on the server. Saves are chained per book; different books stay independent.
   */
  const save = (book: BookDetails, patch: BookDetailsPatch) => {
    const fields = Object.keys(patch) as TocField[];
    if (projectUnitId === null || fields.length === 0) return;

    const variables = { projectUnitId, bookId: book.bookId, fields: patch };
    for (const field of fields) {
      inFlightRef.current[inFlightKey(book.bookId, field)] = patch[field] ?? '';
    }

    const run = async () => {
      try {
        await updateBookDetails.mutateAsync(variables);
        settleDrafts(book.bookId, patch);
        if (isOpenRef.current) setSaveError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('bookDetailsSaveFailed');
        // While the dialog is up the message belongs next to the fields. Once it is gone a
        // toast is the only way to tell the user their edit did not land.
        if (isOpenRef.current) setSaveError(message);
        else toast.error(message);
        Logger.logException(err, {
          context: 'Book details save failed',
          projectUnitId: variables.projectUnitId,
          bookId: book.bookId,
          fields: fields.join(','),
        });
      } finally {
        for (const field of fields) {
          const key = inFlightKey(book.bookId, field);
          // Only if a newer save has not claimed the field in the meantime.
          if (inFlightRef.current[key] === (patch[field] ?? '')) delete inFlightRef.current[key];
        }
      }
    };

    saveChainRef.current[book.bookId] = (
      saveChainRef.current[book.bookId] ?? Promise.resolve()
    ).then(run);
  };

  const handleBlur = (book: BookDetails, field: TocField) => {
    save(book, dirtyFields(book, field));
  };

  const handleClose = () => {
    for (const book of books ?? []) {
      save(book, dirtyFields(book));
    }
    // Drafts are not wiped here. `settleDrafts` drops each one as the server confirms it, so an
    // edit whose close-time save fails stays in the field instead of being thrown away silently.
    setOpenBooks([]);
    setSaveError(null);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className='flex max-h-[80vh] flex-col sm:max-w-2xl'>
        <DialogHeader className='flex-shrink-0'>
          <DialogTitle>{t('editProjectMetadata')}</DialogTitle>
          <DialogDescription>{t('editProjectMetadataDescription')}</DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto pr-1'>
          {isLoading ? (
            <div className='flex items-center justify-center gap-2 py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
              <span className='text-gray-500'>{t('loadingBooks')}</span>
            </div>
          ) : error ? (
            <div className='flex items-center justify-center py-8'>
              <span className='text-red-500'>{error.message}</span>
            </div>
          ) : !books?.length ? (
            <div className='flex items-center justify-center py-8'>
              <span className='text-gray-500'>{t('noBooksInProject')}</span>
            </div>
          ) : (
            <TooltipProvider>
              <Accordion
                className='w-full'
                type='multiple'
                value={openBooks}
                onValueChange={setOpenBooks}
              >
                {books.map(book => (
                  <AccordionItem key={book.bookId} value={String(book.bookId)}>
                    <AccordionTrigger className='hover:no-underline'>
                      <span className='flex items-baseline gap-2'>
                        <span className='font-medium'>{book.bookName}</span>
                        <span className='text-muted-foreground text-xs'>{book.bookCode}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className='grid gap-3 px-1 pt-1 sm:grid-cols-3'>
                        {TOC_FIELDS.map(field => {
                          const meta = TOC_FIELD_META[field];
                          const inputId = `book-${book.bookId}-${field}`;
                          return (
                            <div key={field} className='flex flex-col gap-1.5'>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Label className='w-fit cursor-help' htmlFor={inputId}>
                                    {t(meta.labelKey)}
                                  </Label>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t('storedAsMarker', { marker: meta.marker })}
                                </TooltipContent>
                              </Tooltip>
                              <Input
                                id={inputId}
                                maxLength={200}
                                placeholder={t(meta.placeholderKey)}
                                value={valueOf(book, field)}
                                onBlur={() => handleBlur(book, field)}
                                onChange={event => setField(book.bookId, field, event.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TooltipProvider>
          )}
        </div>

        {saveError && (
          <p className='text-sm text-red-500' role='alert'>
            {saveError}
          </p>
        )}

        <DialogFooter className='flex-shrink-0'>
          <Button variant='outline' onClick={handleClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
