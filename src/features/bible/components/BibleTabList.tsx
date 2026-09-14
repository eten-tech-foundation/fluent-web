import { Fragment } from 'react';

import { X } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type BibleVerse } from '@/features/resources/hooks/hooks';

export const SOURCE_BIBLE_TAB_ID = 'source';

export interface ResourceBibleTab {
  id: string;
  label: string;
  language: string;
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
  `dark:text-foreground h-auto flex-none rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-bold after:hidden data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent cursor-pointer text-slate-800 whitespace-nowrap transition-colors ${
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
    <Tabs className='min-w-0' value={activeTabId} onValueChange={onSelect}>
      <TabsList
        aria-label='Bible versions'
        className='h-auto w-full min-w-0 justify-start gap-1 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto'
      >
        <TabsTrigger
          aria-controls={undefined}
          className={`${tabClassName(activeTabId === SOURCE_BIBLE_TAB_ID)} shrink-0`}
          value={SOURCE_BIBLE_TAB_ID}
        >
          {sourceLabel}
        </TabsTrigger>

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
                        <TabsTrigger
                          aria-controls={undefined}
                          className={tabClassName(isActive)}
                          value={tab.id}
                          onKeyDown={event => {
                            if (isActive && (event.key === 'Enter' || event.key === ' '))
                              onSelect(tab.id);
                          }}
                          onMouseDown={event => {
                            if (isActive && event.button === 0 && !event.ctrlKey) onSelect(tab.id);
                          }}
                        >
                          {tab.label}
                        </TabsTrigger>
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
      </TabsList>
    </Tabs>
  );
}
