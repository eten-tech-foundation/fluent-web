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
}

// Chip layout constants (must match UserChip CSS exactly)
// px-2 = 8px left + 8px right, gap-1 = 4px between chips
// rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium
const CHIP_PADDING_X = 16; // px-2 on both sides = 8+8
const CHIP_MAX_CONTENT = 120; // max-w-[120px] minus padding = capped text width
const GAP = 4; // gap-1
const CHEVRON_W = 32; // ml-2 + w-4 icon
const TRIGGER_PADDING_X = 24; // px-3 on both sides = 12+12
const BADGE_PADDING_X = 16; // px-2 both sides
const BADGE_MIN_W = 28; // minimum width for "+1"

let canvasCtx: CanvasRenderingContext2D | null = null;

/**
 * Measures text width using an offscreen canvas — zero DOM impact,
 * works at any viewport size, no reflow triggered.
 */
function measureTextWidth(text: string, font: string): number {
  if (!canvasCtx) {
    const canvas = document.createElement('canvas');
    canvasCtx = canvas.getContext('2d');
  }
  if (!canvasCtx) return 0;
  canvasCtx.font = font;
  return canvasCtx.measureText(text).width;
}

function chipWidth(label: string, font: string): number {
  const textW = Math.min(measureTextWidth(label, font), CHIP_MAX_CONTENT);
  return Math.ceil(textW) + CHIP_PADDING_X;
}

function badgeWidth(count: number, font: string): number {
  const textW = measureTextWidth(`+${count}`, font);
  return Math.max(BADGE_MIN_W, Math.ceil(textW) + BADGE_PADDING_X);
}

function computeVisibleCount(labels: string[], availableWidth: number, font: string): number {
  if (labels.length === 0) return 0;

  const chipWidths = labels.map(l => chipWidth(l, font));
  let usedWidth = 0;
  let count = 0;

  for (let i = 0; i < chipWidths.length; i++) {
    const isLast = i === chipWidths.length - 1;
    const gap = i === 0 ? 0 : GAP;
    // Only reserve badge space when this is NOT the last chip
    const reserve = isLast ? 0 : GAP + badgeWidth(chipWidths.length - i - 1, font);
    const needed = gap + chipWidths[i] + reserve;

    if (usedWidth + needed <= availableWidth) {
      usedWidth += gap + chipWidths[i];
      count++;
    } else {
      break;
    }
  }

  return Math.max(1, count);
}

function UserChip({ label }: { label: string }) {
  return (
    <span className='bg-primary/10 inline-flex max-w-[120px] shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium'>
      <span className='truncate'>{label}</span>
    </span>
  );
}

export function UserMultiSelect({
  value,
  onChange,
  users,
  isLoading = false,
  disabled = false,
  placeholder = 'Select user(s)',
}: UserMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  // Resolve the font once from the wrapper element so canvas uses the real font
  const [chipFont, setChipFont] = useState('500 12px ui-sans-serif');

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.getBoundingClientRect().width;
      setAvailableWidth(w - TRIGGER_PADDING_X - CHEVRON_W);
    };

    // Resolve font from computed styles (text-xs font-medium = 12px 500)
    const style = window.getComputedStyle(el);
    const size = '12px';
    const family = style.fontFamily || 'ui-sans-serif, system-ui, sans-serif';
    setChipFont(`500 ${size} ${family}`);

    updateWidth();

    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username)),
    [users]
  );

  const selectedLabels = useMemo(
    () => users.filter(u => value.includes(u.id)).map(u => u.username),
    [value, users]
  );

  // Pure computation — no DOM involvement
  const visibleCount = useMemo(
    () =>
      availableWidth > 0
        ? computeVisibleCount(selectedLabels, availableWidth, chipFont)
        : selectedLabels.length,
    [selectedLabels, availableWidth, chipFont]
  );

  const chipsToShow = selectedLabels.slice(0, visibleCount);
  const overflowCount = selectedLabels.length - visibleCount;

  const toggleUser = (userId: number) => {
    if (disabled || isLoading) return;
    onChange(value.includes(userId) ? value.filter(v => v !== userId) : [...value, userId]);
  };

  if (isLoading) {
    return (
      <div ref={wrapperRef} className='w-full'>
        <div className='text-muted-foreground box-border flex w-full cursor-not-allowed items-center justify-between rounded-md border px-3 py-2 text-sm'>
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
        <div className='text-muted-foreground box-border flex w-full cursor-not-allowed items-center justify-between rounded-md border px-3 py-2 text-sm'>
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
          <div className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden'>
            {selectedLabels.length === 0 ? (
              <span className='text-muted-foreground truncate'>{placeholder}</span>
            ) : (
              <>
                {chipsToShow.map(label => (
                  <UserChip key={label} label={label} />
                ))}
                {overflowCount > 0 && (
                  <span className='bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium'>
                    +{overflowCount}
                  </span>
                )}
              </>
            )}
          </div>
          <ChevronDown className='ml-2 h-4 w-4 shrink-0' />
        </PopoverTrigger>

        <PopoverContent
          align='start'
          className='text-popover-foreground pointer-events-auto rounded-md border p-0 shadow-md'
          side='bottom'
          style={{
            width:
              availableWidth > 0
                ? `${Math.round(availableWidth + TRIGGER_PADDING_X + CHEVRON_W)}px`
                : undefined,
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
