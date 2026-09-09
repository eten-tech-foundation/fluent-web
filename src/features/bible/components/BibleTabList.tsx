import { Fragment, type KeyboardEvent, useRef } from 'react';

import { X } from 'lucide-react';

import { type BibleVerse } from '@/features/resources/hooks/hooks';

export const SOURCE_BIBLE_TAB_ID = 'source';

export interface ResourceBibleTab {
  id: string;
  label: string;
  verses: BibleVerse[];
  isLoading: boolean;
}

interface BibleTabListProps {
  sourceLabel: string;
  resourceTabs: Array<Pick<ResourceBibleTab, 'id' | 'label'>>;
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

const tabClassName = (active: boolean) =>
  `dark:text-foreground cursor-pointer text-2xl font-bold text-slate-800 whitespace-nowrap transition-colors ${
    active ? 'border-primary border-b-2 pb-1' : 'text-muted-foreground'
  }`;

/**
 * Source-first Bible navigation shared by every drafting view.
 *
 * Resource tabs may outgrow the source column on smaller screens. Only that
 * resource section scrolls, keeping the permanent source tab visible.
 */
export function BibleTabList({
  sourceLabel,
  resourceTabs,
  activeTabId,
  onSelect,
  onClose,
}: BibleTabListProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const orderedTabIds = [SOURCE_BIBLE_TAB_ID, ...resourceTabs.map(tab => tab.id)];

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTabId: string) => {
    const currentIndex = orderedTabIds.indexOf(currentTabId);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + orderedTabIds.length) % orderedTabIds.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % orderedTabIds.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = orderedTabIds.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTabId = orderedTabIds[nextIndex];
    onSelect(nextTabId);
    tabRefs.current.get(nextTabId)?.focus();
  };

  return (
    <div aria-label='Bible versions' className='flex min-w-0 items-center gap-1' role='tablist'>
      <button
        ref={element => {
          if (element) tabRefs.current.set(SOURCE_BIBLE_TAB_ID, element);
          else tabRefs.current.delete(SOURCE_BIBLE_TAB_ID);
        }}
        aria-selected={activeTabId === SOURCE_BIBLE_TAB_ID}
        className={`${tabClassName(activeTabId === SOURCE_BIBLE_TAB_ID)} shrink-0`}
        role='tab'
        tabIndex={activeTabId === SOURCE_BIBLE_TAB_ID ? 0 : -1}
        type='button'
        onClick={() => onSelect(SOURCE_BIBLE_TAB_ID)}
        onKeyDown={event => handleKeyDown(event, SOURCE_BIBLE_TAB_ID)}
      >
        {sourceLabel}
      </button>

      {resourceTabs.length > 0 && (
        <>
          <span
            aria-hidden='true'
            className='dark:text-foreground mx-2 shrink-0 text-2xl font-bold text-slate-800 select-none'
          >
            |
          </span>
          <div
            aria-label='Open resource Bibles'
            className='min-w-0 flex-1 overflow-x-auto'
            role='group'
          >
            <div className='flex w-max items-center gap-1'>
              {resourceTabs.map((tab, index) => {
                const isActive = activeTabId === tab.id;

                return (
                  <Fragment key={tab.id}>
                    {index > 0 && (
                      <span
                        aria-hidden='true'
                        className='dark:text-foreground mx-2 text-2xl font-bold text-slate-800 select-none'
                      >
                        |
                      </span>
                    )}
                    <div className='flex items-center'>
                      <button
                        ref={element => {
                          if (element) tabRefs.current.set(tab.id, element);
                          else tabRefs.current.delete(tab.id);
                        }}
                        aria-selected={isActive}
                        className={tabClassName(isActive)}
                        role='tab'
                        tabIndex={isActive ? 0 : -1}
                        type='button'
                        onClick={() => onSelect(tab.id)}
                        onKeyDown={event => handleKeyDown(event, tab.id)}
                      >
                        {tab.label}
                      </button>
                      <button
                        aria-label={`Close ${tab.label}`}
                        className='text-muted-foreground hover:text-foreground ml-1 cursor-pointer transition-colors'
                        type='button'
                        onClick={() => onClose(tab.id)}
                      >
                        <X aria-hidden='true' className='h-4 w-4' />
                      </button>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
