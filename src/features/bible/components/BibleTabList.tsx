import { Fragment } from 'react';

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
  return (
    <div aria-label='Bible versions' className='flex min-w-0 items-center gap-1' role='tablist'>
      <button
        aria-selected={activeTabId === SOURCE_BIBLE_TAB_ID}
        className={`${tabClassName(activeTabId === SOURCE_BIBLE_TAB_ID)} shrink-0`}
        role='tab'
        tabIndex={activeTabId === SOURCE_BIBLE_TAB_ID ? 0 : -1}
        type='button'
        onClick={() => onSelect(SOURCE_BIBLE_TAB_ID)}
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
                        aria-selected={isActive}
                        className={tabClassName(isActive)}
                        role='tab'
                        tabIndex={isActive ? 0 : -1}
                        type='button'
                        onClick={() => onSelect(tab.id)}
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
