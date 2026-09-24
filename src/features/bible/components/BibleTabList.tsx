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
  isError: boolean;
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
 * The source is permanent. Resources reuses the second tab; long labels truncate
 * within the column instead of adding a horizontal scrollbar.
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
          className={`${tabClassName(activeTabId === SOURCE_BIBLE_TAB_ID)} min-w-0 ${resourceTabs.length ? 'max-w-1/2' : 'max-w-full'}`}
          title={sourceLabel}
          value={SOURCE_BIBLE_TAB_ID}
        >
          <span className='truncate'>{sourceLabel}</span>
        </TabsTrigger>

        {resourceTabs.length > 0 && (
          <>
            <span
              aria-hidden='true'
              className='dark:text-foreground mx-2 shrink-0 text-2xl font-bold text-slate-800 select-none'
            >
              |
            </span>
            <div aria-label='Open resource Bibles' className='min-w-0 flex-1' role='group'>
              <div className='flex min-w-0 items-center gap-1'>
                {resourceTabs.map(tab => {
                  const isActive = activeTabId === tab.id;

                  return (
                    <div key={tab.id} className='flex min-w-0 items-center'>
                      <TabsTrigger
                        aria-controls={undefined}
                        className={`${tabClassName(isActive)} min-w-0 shrink`}
                        title={tab.label}
                        value={tab.id}
                        onKeyDown={event => {
                          if (isActive && (event.key === 'Enter' || event.key === ' '))
                            onSelect(tab.id);
                        }}
                        onMouseDown={event => {
                          if (isActive && event.button === 0 && !event.ctrlKey) onSelect(tab.id);
                        }}
                      >
                        <span className='truncate'>{tab.label}</span>
                      </TabsTrigger>
                      <button
                        aria-label={`Close ${tab.label}`}
                        className='text-muted-foreground hover:text-foreground ml-1 shrink-0 cursor-pointer transition-colors'
                        type='button'
                        onClick={() => onClose(tab.id)}
                      >
                        <X aria-hidden='true' className='h-4 w-4' />
                      </button>
                    </div>
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
