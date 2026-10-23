import { useCallback, useEffect, useRef, useState } from 'react';

import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
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
 * What the inputs show for a book as the server holds it. Each field is its own \toc value;
 * the running header and book title (\h, \mt) are never shown or seeded here.
 */
const serverValues = (book: BookDetails): TocValues => ({
  tocLongName: book.tocLongName ?? '',
  tocShortName: book.tocShortName ?? '',
  tocAbbreviation: book.tocAbbreviation ?? '',
});

const inFlightKey = (bookId: number, field: TocField) => `${bookId}:${field}`;

// A new project gets its own drafts, save queue and callbacks. An old PATCH can finish
// without settling a matching draft in the newly selected project.
export const EditProjectMetadataDialog: React.FC<EditProjectMetadataDialogProps> = props => (
  <ProjectMetadataSession key={props.projectUnitId} {...props} />
);

const ProjectMetadataSession: React.FC<EditProjectMetadataDialogProps> = ({
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
  const flushRef = useRef<() => void>(() => {});

  // The pinned footer grows with a save error, more when the message wraps, so the panel's scroll
  // padding follows its rendered height. An opened book or a focused field then always stops
  // above the footer instead of under it.
  const [footerHeight, setFooterHeight] = useState<number>();
  const footerObserverRef = useRef<ResizeObserver | null>(null);
  const footerRef = useCallback((footer: HTMLDivElement | null) => {
    footerObserverRef.current?.disconnect();
    footerObserverRef.current = null;
    if (!footer) return;
    const observer = new ResizeObserver(() => setFooterHeight(footer.offsetHeight));
    observer.observe(footer);
    footerObserverRef.current = observer;
  }, []);

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

  // Keep the latest books and project-bound save function available to lifecycle cleanup.
  useEffect(() => {
    flushRef.current = () => {
      for (const book of books ?? []) {
        save(book, dirtyFields(book));
      }
    };
  });

  useEffect(() => {
    if (isOpenRef.current && !isOpen) {
      // A URL change (including browser Back) bypasses Radix's onOpenChange.
      flushRef.current();
      setOpenBooks([]);
      setSaveError(null);
    }
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(
    () => () => {
      isOpenRef.current = false;
      // Route changes can unmount the dialog while a field still has focus.
      flushRef.current();
    },
    []
  );

  const handleClose = () => {
    flushRef.current();
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
      {/* The whole panel scrolls, not only the book list: with the page scroll-locked behind the
          dialog, a wheel over the title, the padding or the footer used to do nothing (QA on
          #398). */}
      <DialogContent
        className='max-h-[80vh] overflow-y-auto pb-0 sm:max-w-2xl'
        style={{ scrollPaddingBottom: footerHeight }}
      >
        <DialogHeader>
          <DialogTitle>{t('editProjectMetadata')}</DialogTitle>
          <DialogDescription>{t('editProjectMetadataDescription')}</DialogDescription>
        </DialogHeader>

        <div>
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
            <TooltipProvider delayDuration={300}>
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
                    <AccordionContent
                      onAnimationEnd={event => {
                        // A book opened near the bottom grows out of sight. Once the opening
                        // animation has given it its full height, bring its fields into view.
                        const region = event.currentTarget;
                        if (event.target === region && region.dataset.state === 'open') {
                          region.parentElement?.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                    >
                      <div className='grid gap-3 px-1 pt-1 sm:grid-cols-3'>
                        {TOC_FIELDS.map(field => {
                          const meta = TOC_FIELD_META[field];
                          const inputId = `book-${book.bookId}-${field}`;
                          const markerId = `${inputId}-marker`;
                          const markerText = t('storedAsMarker', { marker: meta.marker });
                          return (
                            <div key={field} className='flex flex-col gap-1.5'>
                              {/* The span is the trigger because Label does not forward a ref,
                                  and a tooltip Radix cannot measure renders above the dialog.
                                  Same look as the milestone name tooltip, but above. */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className='w-fit'>
                                    <Label htmlFor={inputId}>{t(meta.labelKey)}</Label>
                                  </span>
                                </TooltipTrigger>
                                <TooltipPortal>
                                  <TooltipContent
                                    className='max-w-[420px] text-xs font-normal break-words'
                                    side='top'
                                    sideOffset={4}
                                  >
                                    {markerText}
                                  </TooltipContent>
                                </TooltipPortal>
                              </Tooltip>
                              <Input
                                aria-describedby={markerId}
                                id={inputId}
                                maxLength={200}
                                placeholder={t(meta.placeholderKey)}
                                value={valueOf(book, field)}
                                onBlur={() => handleBlur(book, field)}
                                onChange={event => setField(book.bookId, field, event.target.value)}
                              />
                              {/* The tooltip opens on hover only, so the input carries the
                                  marker for keyboard and screen reader users. */}
                              <span className='sr-only' id={markerId}>
                                {markerText}
                              </span>
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

        {/* Pinned to the bottom while the books scroll, so Close and a save error stay in view.
            It carries the panel's bottom padding, which would otherwise scroll in below it, and
            takes over the gap above it, so at rest nothing moves. */}
        <div ref={footerRef} className='bg-card sticky bottom-0 -mt-4 grid gap-4 pt-4 pb-6'>
          {saveError && (
            <p className='text-sm text-red-500' role='alert'>
              {saveError}
            </p>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={handleClose}>
              {t('close')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
