import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Check, ChevronsUpDown, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  onClear,
  placeholder = 'Select an option...',
  disabled = false,
  emptyText = 'No options found.',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lowerSearch = search.toLowerCase();
    return options.filter(
      opt =>
        opt.label.toLowerCase().includes(lowerSearch) ||
        (opt.subLabel?.toLowerCase().includes(lowerSearch) ?? false) ||
        opt.value.toLowerCase().includes(lowerSearch)
    );
  }, [options, search]);

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Height constants for virtualization
  const hasSubLabels = options.some(opt => !!opt.subLabel);
  const itemHeight = hasSubLabels ? 48 : 36;
  const containerHeight = 240; // max-h-60 = 240px
  const totalHeight = filteredOptions.length * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 3);
  const endIndex = Math.min(
    filteredOptions.length,
    Math.floor((scrollTop + containerHeight) / itemHeight) + 3
  );

  const visibleOptions = filteredOptions.slice(startIndex, endIndex);

  const [focusedIndex, setFocusedIndex] = useState(0);

  // Reset scroll and focus when search changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setFocusedIndex(0);
  }, [search]);

  // Reset focus and scroll when opening
  useEffect(() => {
    if (open) {
      setFocusedIndex(0);
      setScrollTop(0);
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    }
  }, [open]);

  const scrollToIndex = (index: number) => {
    if (!containerRef.current) return;
    const itemTop = index * itemHeight;
    const containerTop = containerRef.current.scrollTop;
    const containerBottom = containerTop + containerHeight;

    if (itemTop < containerTop) {
      containerRef.current.scrollTop = itemTop;
    } else if (itemTop + itemHeight > containerBottom) {
      containerRef.current.scrollTop = itemTop + itemHeight - containerHeight;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const next = Math.min(prev + 1, filteredOptions.length - 1);
        scrollToIndex(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const next = Math.max(prev - 1, 0);
        scrollToIndex(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (
        filteredOptions.length > 0 &&
        focusedIndex >= 0 &&
        focusedIndex < filteredOptions.length
      ) {
        onChange(filteredOptions[focusedIndex].value);
        setOpen(false);
        setSearch('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className='relative w-full'>
          <Input
            className={cn(
              'dark:bg-input/30 dark:hover:bg-input/50 w-full cursor-default bg-transparent pr-8 hover:bg-transparent focus:cursor-text',
              className
            )}
            disabled={disabled}
            placeholder={selectedOption ? selectedOption.label : placeholder}
            value={open ? search : selectedOption ? selectedOption.label : ''}
            onChange={e => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onClick={e => {
              // Prevent clicking the input from closing the popover if it's already open
              if (open) {
                e.stopPropagation();
              }
            }}
            onFocus={() => {
              if (!open) {
                setOpen(true);
                setSearch('');
              }
            }}
            onKeyDown={handleKeyDown}
          />
          {value && onClear ? (
            <button
              aria-label='Clear selection'
              className='absolute top-1/2 right-3 -translate-y-1/2 rounded-sm opacity-50 hover:opacity-100 focus:outline-none'
              tabIndex={-1}
              type='button'
              onClick={e => {
                e.stopPropagation();
                onClear();
                setSearch('');
                setOpen(false);
              }}
            >
              <X className='h-4 w-4' />
            </button>
          ) : (
            <ChevronsUpDown className='pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-50' />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-(--radix-popover-trigger-width) p-0'
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div
          ref={containerRef}
          className='max-h-60 overflow-y-auto p-1'
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
          onWheel={e => {
            // Radix Dialog's scroll lock blocks wheel events on portaled PopoverContent.
            // Manually apply scroll to bypass it.
            e.stopPropagation();
            if (containerRef.current) {
              containerRef.current.scrollTop += e.deltaY;
            }
          }}
        >
          {filteredOptions.length === 0 ? (
            <div className='text-muted-foreground p-4 text-center text-sm'>{emptyText}</div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative' }}>
              {visibleOptions.map((opt, i) => {
                const actualIndex = startIndex + i;
                const isFocused = actualIndex === focusedIndex;
                const isSelected = value === opt.value;
                return (
                  <div
                    key={opt.value}
                    className={cn(
                      'hover:bg-accent hover:text-accent-foreground relative flex cursor-pointer items-center rounded-sm pr-8 pl-2 text-sm outline-none select-none',
                      isFocused
                        ? 'bg-accent text-accent-foreground'
                        : isSelected
                          ? 'bg-accent/50'
                          : ''
                    )}
                    style={{
                      position: 'absolute',
                      top: actualIndex * itemHeight,
                      left: 0,
                      width: '100%',
                      height: itemHeight,
                    }}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setSearch('');
                    }}
                    onMouseEnter={() => setFocusedIndex(actualIndex)}
                  >
                    <div className='flex flex-col overflow-hidden'>
                      <span className='truncate font-medium'>{opt.label}</span>
                      {opt.subLabel && (
                        <span className='text-muted-foreground truncate text-xs'>
                          {opt.subLabel}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className='absolute right-2 flex size-3.5 items-center justify-center'>
                        <Check className='size-4' />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
