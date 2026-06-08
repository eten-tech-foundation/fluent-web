import { useEffect, useRef, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface FilterOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

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
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={triggerRef}
        className={`box-border flex min-w-40 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
          isActive ? 'border-primary text-foreground font-medium' : 'text-foreground border-border'
        }`}
      >
        <span className='truncate'>{triggerLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </PopoverTrigger>

      <PopoverContent
        align='start'
        className='text-popover-foreground pointer-events-auto rounded-md border p-0 shadow-md'
        sideOffset={4}
        style={{
          width: triggerWidth ? `${Math.round(triggerWidth)}px` : undefined,
          boxSizing: 'border-box',
          minWidth: '160px',
        }}
        onCloseAutoFocus={e => e.preventDefault()}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div
          className='max-h-72 overflow-y-auto py-1'
          onTouchMove={e => e.stopPropagation()}
          onWheel={e => e.stopPropagation()}
        >
          <button
            className={`hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center px-3 py-2 text-left text-sm font-medium ${
              !isActive ? 'text-primary' : 'text-foreground'
            }`}
            type='button'
            onClick={clearAll}
          >
            {label}
          </button>

          <div className='bg-border my-1 h-px' />

          {options.length === 0 ? (
            <div className='text-muted-foreground px-3 py-2 text-sm'>No options available</div>
          ) : (
            options.map(option => {
              const checked = selected.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm ${
                    checked ? 'bg-accent/40' : ''
                  }`}
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
