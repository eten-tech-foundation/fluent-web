import { useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Book {
  bibleId: number;
  bookId: number;
  book: {
    id: number;
    code: string;
    eng_display_name: string;
  };
}

interface BibleBookMultiSelectPopoverProps {
  value: number[];
  onChange: (next: number[]) => void;
  books: Book[];
  disabled?: boolean;
  placeholder?: string;
  maxVisibleNames?: number;
}

export function BibleBookMultiSelectPopover({
  value,
  onChange,
  books,
  disabled = false,
  placeholder = 'Select book(s)',
  maxVisibleNames = 3,
}: BibleBookMultiSelectPopoverProps) {
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperWidth, setWrapperWidth] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      if (wrapperRef.current) {
        setWrapperWidth(wrapperRef.current.getBoundingClientRect().width);
      }
    };
    update();

    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const selectedLabels = useMemo(
    () => books.filter(b => value.includes(b.book.id)).map(b => b.book.eng_display_name),
    [value, books]
  );

  const displayText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= maxVisibleNames
        ? selectedLabels.join(', ')
        : `${selectedLabels.slice(0, maxVisibleNames).join(', ')} +${
            selectedLabels.length - maxVisibleNames
          } more`;

  const toggleBook = (bookValue: string) => {
    if (disabled) return;

    if (value.includes(Number(bookValue))) {
      onChange(value.filter(v => v !== Number(bookValue)));
    } else {
      onChange([...value, Number(bookValue)]);
    }
  };

  if (disabled) {
    return (
      <div ref={wrapperRef} className='w-full'>
        <div className='bg-background border-input text-muted-foreground flex h-9 w-full cursor-not-allowed items-center justify-between rounded-md border px-3 py-2 text-left text-sm opacity-60 shadow-2xs'>
          <span className='truncate'>
            {books.length === 0 ? 'No books available' : 'Select a bible first'}
          </span>
          <ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className='w-full'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className='bg-background border-input hover:bg-background focus:ring-ring/50 flex h-9 w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left text-sm shadow-2xs transition-colors focus:ring-2 focus:outline-none'>
          <span
            className={
              selectedLabels.length === 0
                ? 'text-muted-foreground truncate'
                : 'text-foreground truncate font-medium'
            }
          >
            {displayText}
          </span>
          <ChevronDown className='text-muted-foreground ml-2 h-4 w-4 shrink-0 opacity-70' />
        </PopoverTrigger>

        <PopoverContent
          align='start'
          className='bg-sidebar dark:bg-sidebar border-border text-foreground pointer-events-auto z-50 rounded-lg p-1.5 shadow-xl'
          side='top'
          style={{
            width: wrapperWidth ? `${Math.round(wrapperWidth)}px` : undefined,
            boxSizing: 'border-box',
          }}
          onCloseAutoFocus={e => e.preventDefault()}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div
            className='max-h-82 space-y-0.5 overflow-y-auto py-0.5'
            onTouchMove={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            {books.length === 0 ? (
              <div className='text-muted-foreground px-3 py-2 text-sm'>No books available</div>
            ) : (
              books.map(book => {
                const checked = value.includes(book.book.id);
                return (
                  <label
                    key={book.book.id}
                    className={`hover:bg-background/80 hover:text-foreground flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      checked ? 'bg-background font-semibold shadow-2xs' : ''
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      className='h-4 w-4'
                      onCheckedChange={() => toggleBook(book.book.id.toString())}
                    />
                    <span className='truncate'>{book.book.eng_display_name}</span>
                  </label>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
