import { useEffect, useRef, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/ui/utils';

export interface FilterOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  onOpenChange,
  className,
  contentClassName,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      if (triggerRef.current) {
        setTriggerWidth(triggerRef.current.getBoundingClientRect().width);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (triggerRef.current) ro.observe(triggerRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const isActive = selected.length > 0;

  const triggerLabel = (() => {
    if (!isActive) return label;
    const firstLabel = options.find(o => o.value === selected[0])?.label ?? selected[0];
    if (selected.length === 1) return firstLabel;
    return `${firstLabel} +${selected.length - 1}`;
  })();

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clearAll = () => {
    onChange([]);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        className={cn(
          'bg-card box-border flex h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800',
          !className?.includes('w-') && 'w-48',
          isActive ? 'border-primary text-foreground font-medium' : 'text-foreground border-input',
          className
        )}
      >
        <span className='truncate'>{triggerLabel}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')}
        />
      </PopoverTrigger>

      <PopoverContent
        align='start'
        className={cn(
          'text-popover-foreground pointer-events-auto overflow-x-hidden rounded-md border p-1 shadow-md',
          contentClassName || 'w-72'
        )}
        sideOffset={4}
        style={{
          minWidth: triggerWidth ? `${Math.round(triggerWidth)}px` : undefined,
        }}
        onCloseAutoFocus={e => e.preventDefault()}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div
          className={cn(
            'overflow-x-hidden',
            options.length > 6 ? 'max-h-56 overflow-y-auto' : 'h-auto overflow-y-hidden'
          )}
          onTouchMove={e => e.stopPropagation()}
          onWheel={e => e.stopPropagation()}
        >
          <button
            className={cn(
              'hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
              !isActive ? 'text-primary font-medium' : 'text-foreground font-medium'
            )}
            type='button'
            onClick={clearAll}
          >
            {label}
          </button>

          <div className='bg-border -mx-1 my-1 h-px' />

          {options.length === 0 ? (
            <div className='text-muted-foreground px-2 py-1.5 text-sm'>No options available</div>
          ) : (
            options.map(option => {
              const checked = selected.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                    checked ? 'bg-accent/40 font-medium' : ''
                  )}
                >
                  <Checkbox
                    checked={checked}
                    className='h-4 w-4'
                    onCheckedChange={() => toggle(option.value)}
                  />
                  <span className='truncate'>{option.label}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
