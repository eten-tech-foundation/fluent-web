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
 * Resource tabs may outgrow the source column on smaller screens, so the row
 * scrolls horizontally instead of allowing the permanent source tab to be
 * replaced or clipped out of the layout.
 */
export function BibleTabList({
  sourceLabel,
  resourceTabs,
  activeTabId,
  onSelect,
  onClose,
}: BibleTabListProps) {
  return (
    <div className='min-w-0 overflow-x-auto'>
      <div
        aria-label='Bible versions'
        className='flex w-max min-w-full items-center gap-1'
        role='tablist'
      >
        <button
          aria-selected={activeTabId === SOURCE_BIBLE_TAB_ID}
          className={tabClassName(activeTabId === SOURCE_BIBLE_TAB_ID)}
          role='tab'
          tabIndex={activeTabId === SOURCE_BIBLE_TAB_ID ? 0 : -1}
          type='button'
          onClick={() => onSelect(SOURCE_BIBLE_TAB_ID)}
        >
          {sourceLabel}
        </button>

        {resourceTabs.map(tab => {
          const isActive = activeTabId === tab.id;

          return (
            <Fragment key={tab.id}>
              <span
                aria-hidden='true'
                className='dark:text-foreground mx-2 text-2xl font-bold text-slate-800 select-none'
              >
                |
              </span>
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
  );
}
