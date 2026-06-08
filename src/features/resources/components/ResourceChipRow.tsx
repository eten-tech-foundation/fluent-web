import { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { type ResourceName } from '@/lib/types';

interface ResourceChipRowProps {
  resourceNames: ResourceName[];
  selectedResource: ResourceName;
  onSelect: (resource: ResourceName) => void;
}

export const ResourceChipRow = ({
  resourceNames,
  selectedResource,
  onSelect,
}: ResourceChipRowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(Math.ceil(el.scrollLeft) + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Listen for scroll events and container size changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  // Scroll the selected chip into full view whenever the selection changes
  useEffect(() => {
    const chipEl = chipRefs.current[selectedResource.id];
    const containerEl = scrollRef.current;
    if (!chipEl || !containerEl) return;

    const chipLeft = chipEl.offsetLeft;
    const chipRight = chipLeft + chipEl.offsetWidth;
    const containerScrollLeft = containerEl.scrollLeft;
    const containerRight = containerScrollLeft + containerEl.clientWidth;

    if (chipLeft < containerScrollLeft) {
      containerEl.scrollTo({ left: chipLeft - 8, behavior: 'smooth' });
    } else if (chipRight > containerRight) {
      containerEl.scrollTo({ left: chipRight - containerEl.clientWidth + 8, behavior: 'smooth' });
    }
  }, [selectedResource.id]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className='relative mt-3 flex items-center'>
      {canScrollLeft && (
        <>
          <div className='from-background pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-10 bg-linear-to-r to-transparent' />
          <button
            aria-label='Scroll resource chips left'
            className='text-primary absolute left-0 z-20 flex h-full cursor-pointer items-center pl-0.5'
            type='button'
            onClick={() => scrollBy(-160)}
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        className='flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden'
        style={{ scrollbarWidth: 'none' }}
      >
        {resourceNames.map(resource => {
          const isSelected = resource.id === selectedResource.id;
          return (
            <button
              key={resource.id}
              ref={el => {
                chipRefs.current[resource.id] = el;
              }}
              aria-pressed={isSelected}
              className={`border-primary shrink-0 cursor-pointer rounded-xl border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'text-primary hover:bg-primary/10 bg-transparent'
              }`}
              type='button'
              onClick={() => onSelect(resource)}
            >
              {resource.name}
            </button>
          );
        })}
      </div>

      {canScrollRight && (
        <>
          <div className='from-background pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-10 bg-linear-to-l to-transparent' />
          <button
            aria-label='Scroll resource chips right'
            className='text-primary absolute right-0 z-20 flex h-full cursor-pointer items-center pr-0.5'
            type='button'
            onClick={() => scrollBy(160)}
          >
            <ChevronRight className='h-4 w-4' />
          </button>
        </>
      )}
    </div>
  );
};
