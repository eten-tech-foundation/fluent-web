import { useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown, Loader2 } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type User } from '@/lib/types';

interface UserMultiSelectProps {
  value: number[];
  onChange: (next: number[]) => void;
  users: User[];
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxVisibleNames?: number;
}

export function UserMultiSelect({
  value,
  onChange,
  users,
  isLoading = false,
  disabled = false,
  placeholder = 'Select user(s)',
  maxVisibleNames = 3,
}: UserMultiSelectProps) {
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

    return () => ro.disconnect(); // ResizeObserver alone covers both cases
  }, []);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username)),
    [users]
  );

  const selectedLabels = useMemo(
    () => users.filter(u => value.includes(u.id)).map(u => u.username),
    [value, users]
  );

  const displayText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= maxVisibleNames
        ? selectedLabels.join(', ')
        : `${selectedLabels.slice(0, maxVisibleNames).join(', ')} +${selectedLabels.length - maxVisibleNames} more`;

  const toggleUser = (userId: number) => {
    if (disabled || isLoading) return;
    onChange(value.includes(userId) ? value.filter(v => v !== userId) : [...value, userId]);
  };

  if (isLoading) {
    return (
      <div ref={wrapperRef} className='w-full'>
        <div className='text-muted-foreground box-border flex w-full cursor-not-allowed items-center justify-between rounded-md border px-3 py-2 text-left text-sm'>
          <div className='flex items-center gap-2'>
            <Loader2 className='h-4 w-4 animate-spin' />
            <span>Loading users...</span>
          </div>
          <ChevronDown className='ml-2 h-4 w-4 shrink-0' />
        </div>
      </div>
    );
  }

  if (disabled || users.length === 0) {
    return (
      <div ref={wrapperRef} className='w-full'>
        <div className='text-muted-foreground box-border flex w-full cursor-not-allowed items-center justify-between rounded-md border px-3 py-2 text-left text-sm'>
          <span className='truncate'>
            {users.length === 0 ? 'All users already added' : placeholder}
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
          side='bottom'
          style={{
            width: wrapperWidth ? `${Math.round(wrapperWidth)}px` : undefined,
            boxSizing: 'border-box',
          }}
          onCloseAutoFocus={e => e.preventDefault()}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div
            className='max-h-[180px] overflow-y-auto py-1'
            onTouchMove={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            {sortedUsers.map(user => {
              const checked = value.includes(user.id);
              return (
                <label
                  key={user.id}
                  className={`hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm ${
                    checked ? 'bg-accent/40' : ''
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    className='h-4 w-4'
                    onCheckedChange={() => toggleUser(user.id)}
                  />
                  <span className='truncate'>{user.username}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
