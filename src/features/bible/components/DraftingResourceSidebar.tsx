import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { GripVertical } from 'lucide-react';

import { type LeftTab } from '@/features/bible/hooks/useResourceStatePersistence';
import { LeftPanel } from '@/features/checks/components/LeftPanel';
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
  onBibleSelect: (bible: { id: string; label: string; language: string }) => void;
  onBibleLoadingChange: (bibleId: string, loading: boolean) => void;
  onBibleErrorChange: (bibleId: string, isError: boolean) => void;
  onBibleVersesChange: (bibleId: string, verses: BibleVerse[]) => void;
  selectedBibleId: string | null;
  setCurrentLanguage: (lang: string) => void;
  setCurrentResource: (res: ResourceName) => void;
  /** Controlled active left-panel tab (Resources | Checks), persisted by the
   *  parent in the editor-state blob (Repeated Word Check, W11/§6.6). */
  activeLeftTab: LeftTab;
  /** Called when the translator switches tabs; the parent persists it. */
  onTabChange: (tab: LeftTab) => void;
  /** Cascade-resolved active-finding count; drives the tab notification dot. */
  activeFindingsCount: number;
  /** Body for the Checks tab (the `ChecksPanel`, composed by the parent). */
  checksContent: ReactNode;
  /** Whether the Checks tab is shown at all. When the Repeated Word Check
   *  feature is disabled (feature-flags proposal D6/D7) the tab is hidden so it
   *  looks unimplemented; forwarded straight to `LeftPanel`. Defaults to true. */
  showChecksTab?: boolean;
}

export const DraftingResourceSidebar: React.FC<DraftingResourceSidebarProps> = ({
  containerRef,
  projectItem,
  resourceNames,
  resourceVerseId,
  currentLanguage,
  currentResource,
  clearBibleRef,
  onBibleSelect,
  onBibleLoadingChange,
  onBibleErrorChange,
  onBibleVersesChange,
  selectedBibleId,
  setCurrentLanguage,
  setCurrentResource,
  activeLeftTab,
  onTabChange,
  activeFindingsCount,
  checksContent,
  showChecksTab = true,
}) => {
  const [resourcePanelWidth, setResourcePanelWidth] = useState(25); // percentage
  const isDraggingRef = useRef(false);

  const onPointerMoveRef = useRef<((moveEvent: PointerEvent) => void) | null>(null);
  const onPointerUpRef = useRef<(() => void) | null>(null);

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
        onPointerMoveRef.current = null;
        onPointerUpRef.current = null;
      };

      onPointerMoveRef.current = onPointerMove;
      onPointerUpRef.current = onPointerUp;

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [containerRef]
  );

  useEffect(() => {
    return () => {
      if (onPointerMoveRef.current) {
        document.removeEventListener('pointermove', onPointerMoveRef.current);
      }
      if (onPointerUpRef.current) {
        document.removeEventListener('pointerup', onPointerUpRef.current);
      }
      isDraggingRef.current = false;
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setResourcePanelWidth(prev => Math.max(20, prev - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setResourcePanelWidth(prev => Math.min(40, prev + 1));
    }
  }, []);

  return (
    <>
      <div className='min-w-0 shrink-0 overflow-hidden' style={{ width: `${resourcePanelWidth}%` }}>
        <LeftPanel
          activeFindingsCount={activeFindingsCount}
          activeTab={activeLeftTab}
          checksContent={checksContent}
          resourcesContent={
            <ResourcePanel
              activeVerseId={resourceVerseId}
              initialLanguage={currentLanguage}
              initialResource={currentResource}
              registerClearBible={fn => {
                clearBibleRef.current = fn;
              }}
              resourceNames={resourceNames}
              selectedBibleId={selectedBibleId}
              sourceData={projectItem}
              onBibleErrorChange={onBibleErrorChange}
              onBibleLoadingChange={onBibleLoadingChange}
              onBibleSelect={onBibleSelect}
              onBibleVersesChange={onBibleVersesChange}
              onLanguageChange={setCurrentLanguage}
              onResourceChange={setCurrentResource}
            />
          }
          showChecksTab={showChecksTab}
          onTabChange={onTabChange}
        />
      </div>
      {/* Drag handle */}
      <div
        aria-label='Resize resource panel'
        aria-orientation='vertical'
        aria-valuemax={40}
        aria-valuemin={20}
        aria-valuenow={Math.round(resourcePanelWidth)}
        className='group focus-visible:ring-primary flex h-full w-5 shrink-0 cursor-col-resize items-center justify-center rounded-xs focus:outline-hidden focus-visible:ring-2'
        role='separator'
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handleResizeDragStart}
      >
        <GripVertical className='text-muted-foreground/80 group-hover:text-primary/70 h-5 w-5 transition-colors duration-150' />
      </div>
    </>
  );
};
