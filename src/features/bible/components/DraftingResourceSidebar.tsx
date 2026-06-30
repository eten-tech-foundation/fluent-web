import React, { useCallback, useRef, useState } from 'react';

import { GripVertical } from 'lucide-react';

import { ResourcePanel } from '@/features/resources/components/ResourcePanel';
import { type BibleVerse } from '@/features/resources/hooks/hooks';
import { type ProjectItem, type ResourceName } from '@/lib/types';

interface DraftingResourceSidebarProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  projectItem: ProjectItem;
  resourceNames: ResourceName[];
  resourceVerseId: number;
  currentLanguage: string;
  currentResource: ResourceName;
  clearBibleRef: React.MutableRefObject<(() => void) | null>;
  setBibleTabLabel: (label: string) => void;
  setOpenResourcePanel: (open: boolean) => void;
  setSelectedPanel: (panel: 1 | 2) => void;
  setBibleContentLoading: (loading: boolean) => void;
  setBibleVerses: (verses: BibleVerse[]) => void;
  setCurrentLanguage: (lang: string) => void;
  setCurrentResource: (res: ResourceName) => void;
}

export const DraftingResourceSidebar: React.FC<DraftingResourceSidebarProps> = ({
  containerRef,
  projectItem,
  resourceNames,
  resourceVerseId,
  currentLanguage,
  currentResource,
  clearBibleRef,
  setBibleTabLabel,
  setOpenResourcePanel,
  setSelectedPanel,
  setBibleContentLoading,
  setBibleVerses,
  setCurrentLanguage,
  setCurrentResource,
}) => {
  const [resourcePanelWidth, setResourcePanelWidth] = useState(25); // percentage
  const isDraggingRef = useRef(false);

  const handleResizeDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidthPx = moveEvent.clientX - containerRect.left;
        const newWidthPct = (newWidthPx / containerRect.width) * 100;
        setResourcePanelWidth(Math.min(40, Math.max(20, newWidthPct)));
      };

      const onPointerUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [containerRef]
  );

  return (
    <>
      <div className='min-w-0 shrink-0 overflow-hidden' style={{ width: `${resourcePanelWidth}%` }}>
        <ResourcePanel
          activeVerseId={resourceVerseId}
          bibleResourceName={setBibleTabLabel}
          initialLanguage={currentLanguage}
          initialResource={currentResource}
          openResourceBiblePanel={setOpenResourcePanel}
          registerClearBible={fn => {
            clearBibleRef.current = fn;
          }}
          resourceNames={resourceNames}
          selectPanel={panel => setSelectedPanel(panel as 1 | 2)}
          sourceData={projectItem}
          onBibleLoadingChange={setBibleContentLoading}
          onBibleVersesChange={setBibleVerses}
          onLanguageChange={setCurrentLanguage}
          onResourceChange={setCurrentResource}
        />
      </div>
      {/* Drag handle */}
      <div
        aria-label='Resize resource panel'
        aria-orientation='vertical'
        aria-valuemax={40}
        aria-valuemin={20}
        aria-valuenow={Math.round(resourcePanelWidth)}
        className='group flex h-full w-5 shrink-0 cursor-col-resize items-center justify-center'
        role='separator'
        onPointerDown={handleResizeDragStart}
      >
        <GripVertical className='text-muted-foreground/80 group-hover:text-primary/70 h-5 w-5 transition-colors duration-150' />
      </div>
    </>
  );
};
