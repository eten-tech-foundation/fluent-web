import { useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown, Headphones } from 'lucide-react';

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
  hasAudio?: boolean;
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
        <div className='box-border flex w-full cursor-not-allowed items-center justify-between rounded-md border px-3 py-2 text-left text-sm'>
          <span className='truncate'>
            {books.length === 0 ? 'No books available' : 'Select a bible first'}
          </span>
          <ChevronDown className='ml-2 h-4 w-4 shrink-0' />
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className='w-full'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className='box-border flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800'>
          <span
            className={selectedLabels.length === 0 ? 'text-muted-foreground truncate' : 'truncate'}
          >
            {displayText}
          </span>
          <ChevronDown className='ml-2 h-4 w-4 shrink-0' />
        </PopoverTrigger>

        <PopoverContent
          align='start'
          className='text-popover-foreground pointer-events-auto rounded-md border p-0 shadow-md'
          side='top'
          style={{
            width: wrapperWidth ? `${Math.round(wrapperWidth)}px` : undefined,
            boxSizing: 'border-box',
          }}
          onCloseAutoFocus={e => e.preventDefault()}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div
            className='max-h-82 overflow-y-auto py-1'
            onTouchMove={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            {books.length === 0 ? (
              <div className='px-3 py-2 text-sm'>No books available</div>
            ) : (
              books.map(book => {
                const checked = value.includes(book.book.id);
                return (
                  <label
                    key={book.book.id}
                    className={`hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm ${
                      checked ? 'bg-accent/40' : ''
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      className='h-4 w-4'
                      onCheckedChange={() => toggleBook(book.book.id.toString())}
                    />
                    <div className='flex items-center gap-2'>
                      {book.hasAudio && <Headphones className='text-primary h-4 w-4 shrink-0' />}
                      <span className='truncate'>{book.book.eng_display_name}</span>
                    </div>
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
