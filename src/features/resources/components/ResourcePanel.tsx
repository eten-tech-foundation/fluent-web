import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronRightIcon, Loader2 } from 'lucide-react';

import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item';
import { type ItemWithUrl, type ProjectItem, type ResourceName } from '@/lib/types';

import {
  type BibleVerse,
  type UnifiedBible,
  useBibleResources,
  useGuideContent,
  useResourceDialog,
  useResourceFetch,
  useResourceLanguages,
} from '../hooks/hooks';

import { LanguageDropdown } from './LanguageDropdown';
import { ResourceChipRow } from './ResourceChipRow';
import { ImageDialog, ImageGrid, ResourceDialog } from './ResourceDialog';
import { TextResourceAccordion } from './TextResourceAccordion';

interface ResourcePanelProps {
  activeVerseId: number;
  sourceData: ProjectItem;
  resourceNames: ResourceName[];
  onResourceChange?: (resource: ResourceName) => void;
  onLanguageChange?: (language: string) => void;
  onBibleVersesChange?: (verses: BibleVerse[]) => void;
  onBibleLoadingChange?: (loading: boolean) => void;
  openResourceBiblePanel?: (open: boolean) => void;
  selectPanel?: (panel: number) => void;
  bibleResourceName: (name: string) => void;
  registerClearBible?: (fn: () => void) => void;
  initialResource?: ResourceName;
  initialLanguage?: string;
}

export const ResourcePanel: React.FC<ResourcePanelProps> = ({
  activeVerseId,
  sourceData,
  resourceNames,
  onResourceChange,
  onLanguageChange,
  onBibleVersesChange,
  onBibleLoadingChange,
  openResourceBiblePanel,
  selectPanel,
  bibleResourceName,
  registerClearBible,
  initialResource,
  initialLanguage,
}) => {
  const [selectedResource, setSelectedResource] = useState(initialResource ?? resourceNames[0]);
  const [selectedImage, setSelectedImage] = useState<ItemWithUrl | null>(null);
  const [openItem, setOpenItem] = useState<string[]>([]);

  const isLanguageInitializedRef = useRef(false);
  const hasAutoSelectedRef = useRef(false);

  const isBibleResource = selectedResource.id === 'Bibles';

  const {
    availableLanguages,
    selectedLanguage,
    loadingLanguages,
    handleLanguageChange,
    currentLanguageDirection,
  } = useResourceLanguages(selectedResource, sourceData.sourceLangCode, sourceData);

  useEffect(() => {
    if (initialResource) {
      setSelectedResource(initialResource);
    }
  }, [initialResource]);

  useEffect(() => {
    if (isLanguageInitializedRef.current) return;

    if (loadingLanguages || availableLanguages.length === 0) return;

    if (initialLanguage) {
      const languageExists = availableLanguages.some(l => l.code === initialLanguage);

      if (languageExists) {
        handleLanguageChange(initialLanguage);
        isLanguageInitializedRef.current = true;
        return;
      }
    }

    if (isBibleResource) {
      // Bibles: leave the dropdown empty — no auto-selection per requirements.
      // The user must pick a language before the bible list loads.
      handleLanguageChange('');
      isLanguageInitializedRef.current = true;
    } else {
      // Non-Bible resources: auto-select source language for convenience
      const sourceLanguageExists = availableLanguages.some(
        l => l.code === sourceData.sourceLangCode
      );

      if (sourceLanguageExists && !hasAutoSelectedRef.current) {
        handleLanguageChange(sourceData.sourceLangCode);
        hasAutoSelectedRef.current = true;
        isLanguageInitializedRef.current = true;
      } else {
        handleLanguageChange('');
        isLanguageInitializedRef.current = true;
      }
    }
  }, [
    availableLanguages,
    isBibleResource,
    loadingLanguages,
    initialLanguage,
    sourceData.sourceLangCode,
    handleLanguageChange,
  ]);

  // Reset initialization when switching resource chips
  useEffect(() => {
    isLanguageInitializedRef.current = false;
    hasAutoSelectedRef.current = false;
  }, [selectedResource.id]);

  // Propagate language changes upward (debounced by the ref guard)
  const prevLanguageRef = useRef(selectedLanguage);
  useEffect(() => {
    if (
      isLanguageInitializedRef.current &&
      prevLanguageRef.current !== selectedLanguage &&
      selectedLanguage !== ''
    ) {
      onLanguageChange?.(selectedLanguage);
      prevLanguageRef.current = selectedLanguage;
    }
  }, [selectedLanguage, onLanguageChange]);

  const shouldFetchResources = isLanguageInitializedRef.current && selectedLanguage !== '';

  // Non-Bible resource content
  const { localizeRefName, imageItems, loadingImages } = useResourceFetch(
    selectedResource,
    activeVerseId,
    sourceData,
    shouldFetchResources ? selectedLanguage : undefined
  );

  const {
    guideContents,
    loadingGuides,
    relatedAudioIds,
    setRelatedAudioIds,
    fetchGuideContent,
    fetchRelatedAudio,
  } = useGuideContent();

  const pendingPrefetchIds = useRef<Set<number>>(new Set());

  const { resourceDialog, loadingResourceDialog, handleResourceClick, resourceError, closeDialog } =
    useResourceDialog();

  // Bible resource content
  const {
    unifiedBibles,
    loadingBibles,
    loadingBibleContent,
    selectedBible,
    handleBibleChange,
    clearSelectedBible,
    bibleVerses,
  } = useBibleResources(
    selectedLanguage,
    sourceData.bookCode,
    sourceData.chapterNumber,
    isBibleResource && shouldFetchResources
  );

  // Register clearSelectedBible with DraftingUI once on mount so the × button
  // and toggleResources can call it directly to reset hook-level bible state.
  useEffect(() => {
    registerClearBible?.(clearSelectedBible);
  }, [registerClearBible, clearSelectedBible]);

  // Propagate bible verses to DraftingUI — stringify comparison avoids firing
  // on reference changes that carry identical content.
  const prevBibleVersesStringRef = useRef<string>('');
  useEffect(() => {
    if (!isBibleResource) return;
    const versesString = JSON.stringify(bibleVerses);
    if (prevBibleVersesStringRef.current === versesString) return;
    prevBibleVersesStringRef.current = versesString;
    onBibleVersesChange?.(bibleVerses);
  }, [isBibleResource, bibleVerses, onBibleVersesChange]);

  useEffect(() => {
    if (!isBibleResource) return;
    onBibleLoadingChange?.(loadingBibleContent);
  }, [isBibleResource, loadingBibleContent, onBibleLoadingChange]);

  // Event handlers
  const handleResourceSelect = (resource: ResourceName) => {
    setSelectedResource(resource);
    onResourceChange?.(resource);
    handleLanguageChange('');
  };

  const handleLanguageSelect = (languageCode: string) => {
    handleLanguageChange(languageCode);
  };

  const handleBibleSelect = useCallback(
    (bible: UnifiedBible) => {
      handleBibleChange(bible.id);
      openResourceBiblePanel?.(true);
      selectPanel?.(2);
      bibleResourceName(bible.abbreviation);
    },
    [handleBibleChange, openResourceBiblePanel, selectPanel, bibleResourceName]
  );

  const handleAccordionChange = async (value: string[]) => {
    setOpenItem(value);
    const newlyOpenedItems = value.filter(v => !openItem.includes(v));
    // Fetch content for newly opened items
    for (const itemValue of newlyOpenedItems) {
      const itemId = parseInt(itemValue);
      if (!(itemId in guideContents)) {
        await fetchGuideContent(itemId);
      }

      const item = localizeRefName.find(sv => sv.id === itemId);
      if (item && !(itemId in relatedAudioIds)) {
        const audioId = await fetchRelatedAudio(
          item.localizedName,
          item.grouping.collectionCode ?? '',
          localizeRefName
        );
        if (audioId !== undefined) {
          setRelatedAudioIds(prev => ({ ...prev, [itemId]: audioId }));
        }
      }
    }
  };

  useEffect(() => {
    if (localizeRefName.length > 0 && shouldFetchResources) {
      const firstItemId = localizeRefName[0].id.toString();
      setOpenItem(prev => {
        if (prev.length === 1 && prev[0] === firstItemId) return prev;
        return [firstItemId];
      });
      void handleAccordionChange([firstItemId]);
    } else {
      setOpenItem(prev => (prev.length === 0 ? prev : []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localizeRefName, shouldFetchResources]);

  useEffect(() => {
    if (
      selectedResource.id === 'UWTranslationQuestions' &&
      localizeRefName.length > 0 &&
      shouldFetchResources
    ) {
      localizeRefName.forEach(item => {
        if (!(item.id in guideContents) && !pendingPrefetchIds.current.has(item.id)) {
          pendingPrefetchIds.current.add(item.id);
          fetchGuideContent(item.id)
            .then(() => {
              pendingPrefetchIds.current.delete(item.id);
            })
            .catch(() => {
              pendingPrefetchIds.current.delete(item.id);
            });
        }
      });
    }
  }, [
    selectedResource.id,
    localizeRefName,
    shouldFetchResources,
    guideContents,
    fetchGuideContent,
  ]);

  // Show loading state while initializing
  const isInitializing = !isLanguageInitializedRef.current && loadingLanguages;

  const renderBibleContent = () => {
    // Gate: language must be selected first
    if (!shouldFetchResources) {
      return (
        <div className='flex h-full items-center justify-center'>
          <p className='text-muted-foreground text-sm'>Select a language to view resources</p>
        </div>
      );
    }

    // Loading both lists before showing anything prevents a flash of empty state
    if (loadingBibles) {
      return (
        <div className='flex h-full items-center justify-center'>
          <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
        </div>
      );
    }

    // Requirement: "No Bibles are currently available." empty state
    if (unifiedBibles.length === 0) {
      return (
        <div className='flex h-full items-center justify-center'>
          <p className='text-muted-foreground text-sm'>No Bibles are currently available.</p>
        </div>
      );
    }

    // Bible list — clicking a row opens Tab 2 and highlights the selected entry.
    // Sorted alphabetically (done in useBibleResources).
    return (
      <div className='flex flex-col gap-2'>
        {unifiedBibles.map(bible => {
          const isSelected = selectedBible?.id === bible.id;

          return (
            <Item
              key={bible.id}
              className={`cursor-pointer transition-colors ${
                isSelected ? 'bg-primary/10 ring-primary ring-1' : ''
              }`}
              size='sm'
              onClick={() => handleBibleSelect(bible)}
            >
              <ItemContent>
                <ItemTitle className={isSelected ? 'text-primary font-semibold' : ''}>
                  {bible.abbreviation} — {bible.name}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                {loadingBibleContent && isSelected ? (
                  <Loader2 className='h-4 w-4 animate-spin text-blue-600' />
                ) : (
                  <ChevronRightIcon className='size-4' />
                )}
              </ItemActions>
            </Item>
          );
        })}
      </div>
    );
  };

  const renderResourceContent = () => {
    if (isBibleResource) {
      return renderBibleContent();
    }

    if (isInitializing || loadingImages) {
      return (
        <div className='flex h-full items-center justify-center'>
          <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
        </div>
      );
    }

    if (!shouldFetchResources) {
      return (
        <div className='flex h-full items-center justify-center'>
          <p className='text-sm'>Select a language to view resources</p>
        </div>
      );
    }

    if (imageItems.length > 0) {
      return (
        <ImageGrid
          activeVerseId={activeVerseId}
          items={imageItems}
          sourceData={sourceData}
          onImageClick={setSelectedImage}
        />
      );
    }

    if (localizeRefName.length > 0) {
      return (
        <TextResourceAccordion
          direction={currentLanguageDirection}
          guideContents={guideContents}
          loadingGuides={loadingGuides}
          openItem={openItem}
          relatedAudioIds={relatedAudioIds}
          resourceId={selectedResource.id}
          resources={localizeRefName}
          selectedLanguage={selectedLanguage}
          sourceData={sourceData}
          onAccordionChange={handleAccordionChange}
          onResourceClick={handleResourceClick}
        />
      );
    }

    return (
      <div className='flex h-full items-center justify-center'>
        <p className='text-sm'>No resources available</p>
      </div>
    );
  };

  return (
    <aside className='bg-background flex h-full flex-col'>
      {/* The "Resources" heading was removed: the shared LeftPanel tab row
          ("Resources | Checks") now serves as this panel's header (W11, §6.6). */}
      <div className='bg-background top-0 py-4'>
        <ResourceChipRow
          resourceNames={resourceNames}
          selectedResource={selectedResource}
          onSelect={handleResourceSelect}
        />
        <LanguageDropdown
          availableLanguages={availableLanguages}
          loading={loadingLanguages}
          selectedLanguage={selectedLanguage}
          onSelect={handleLanguageSelect}
        />
      </div>
      <div className='flex flex-1 flex-col overflow-hidden rounded-md border p-2'>
        <div className='flex-1 overflow-y-auto px-4 pt-2'>{renderResourceContent()}</div>
      </div>

      <ImageDialog image={selectedImage} onClose={() => setSelectedImage(null)} />

      <ResourceDialog
        direction={currentLanguageDirection}
        error={resourceError}
        loading={loadingResourceDialog}
        resource={resourceDialog}
        onClose={closeDialog}
        onResourceClick={handleResourceClick}
      />
    </aside>
  );
};

export default ResourcePanel;
