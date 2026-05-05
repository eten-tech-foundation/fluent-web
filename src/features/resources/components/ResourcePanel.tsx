import { useEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';

import { type ItemWithUrl, type ProjectItem, type ResourceName } from '@/lib/types';

import {
  useGuideContent,
  useResourceDialog,
  useResourceFetch,
  useResourceLanguages,
} from '../hooks/hooks';

import { LanguageDropdown } from './LanguageDropdown';
import { ResourceDropdown } from './ResourceComponents';
import { ImageDialog, ImageGrid, ResourceDialog } from './ResourceDialog';
import { TextResourceAccordion } from './TextResourceAccordion';

interface ResourcePanelProps {
  activeVerseId: number;
  sourceData: ProjectItem;
  resourceNames: ResourceName[];
  onResourceChange?: (resource: ResourceName) => void;
  onLanguageChange?: (language: string) => void;
  initialResource?: ResourceName;
  initialLanguage?: string;
}

export const ResourcePanel: React.FC<ResourcePanelProps> = ({
  activeVerseId,
  sourceData,
  resourceNames,
  onResourceChange,
  onLanguageChange,
  initialResource,
  initialLanguage,
}) => {
  const [selectedResource, setSelectedResource] = useState(initialResource ?? resourceNames[0]);
  const [selectedImage, setSelectedImage] = useState<ItemWithUrl | null>(null);
  const [openItem, setOpenItem] = useState<string[]>([]);

  const isLanguageInitializedRef = useRef(false);
  const hasAutoSelectedRef = useRef(false);

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
    // Auto-select source language if available
    const sourceLanguageExists = availableLanguages.some(l => l.code === sourceData.sourceLangCode);

    if (sourceLanguageExists && !hasAutoSelectedRef.current) {
      handleLanguageChange(sourceData.sourceLangCode);
      hasAutoSelectedRef.current = true;
      isLanguageInitializedRef.current = true;
    } else {
      // No source language available, leave empty for user selection
      handleLanguageChange('');
      isLanguageInitializedRef.current = true;
    }
  }, [
    availableLanguages,
    loadingLanguages,
    initialLanguage,
    sourceData.sourceLangCode,
    handleLanguageChange,
  ]);

  // Reset initialization flag when resource changes
  useEffect(() => {
    isLanguageInitializedRef.current = false;
    hasAutoSelectedRef.current = false;
  }, [selectedResource.id]);

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

  // Fetch resources (ONLY this hook depends on activeVerseId for content)
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

  const { resourceDialog, loadingResourceDialog, handleResourceClick, resourceError, closeDialog } =
    useResourceDialog();

  const handleResourceSelect = (resource: ResourceName) => {
    setSelectedResource(resource);
    onResourceChange?.(resource);
    handleLanguageChange('');
  };

  const handleLanguageSelect = (languageCode: string) => {
    handleLanguageChange(languageCode);
  };

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
      setOpenItem([firstItemId]);
      void handleAccordionChange([firstItemId]);
    } else {
      setOpenItem([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localizeRefName, shouldFetchResources]);

  // Show loading state while initializing
  const isInitializing = !isLanguageInitializedRef.current && loadingLanguages;

  const isLanguageDropdownEnabled =
    selectedResource.id === 'UWTranslationNotes' || selectedResource.name === 'Images';

  return (
    <aside className='bg-background flex h-full flex-col'>
      <div className='bg-background top-0 py-4'>
        <div className='flex items-center gap-2'>
          <h3 className='text-foreground text-xl font-semibold'>Resources</h3>
        </div>
        <ResourceDropdown
          resourceNames={resourceNames}
          selectedResource={selectedResource}
          onSelect={handleResourceSelect}
        />

        {isLanguageDropdownEnabled && (
          <LanguageDropdown
            availableLanguages={availableLanguages}
            loading={loadingLanguages}
            selectedLanguage={selectedLanguage}
            onSelect={handleLanguageSelect}
          />
        )}
      </div>
      <div className='flex flex-1 flex-col overflow-hidden rounded-md border p-2'>
        <div className='flex-1 overflow-y-auto px-4 pt-2'>
          {isInitializing || loadingImages ? (
            <div className='flex h-full items-center justify-center'>
              <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
            </div>
          ) : !shouldFetchResources && isLanguageDropdownEnabled ? (
            <div className='flex h-full items-center justify-center'>
              <p className='text-sm'>Select a language to view resources</p>
            </div>
          ) : imageItems.length > 0 ? (
            <ImageGrid
              activeVerseId={activeVerseId}
              items={imageItems}
              sourceData={sourceData}
              onImageClick={setSelectedImage}
            />
          ) : localizeRefName.length > 0 ? (
            <TextResourceAccordion
              direction={currentLanguageDirection}
              guideContents={guideContents}
              loadingGuides={loadingGuides}
              openItem={openItem}
              relatedAudioIds={relatedAudioIds}
              resources={localizeRefName}
              onAccordionChange={handleAccordionChange}
              onResourceClick={handleResourceClick}
            />
          ) : (
            <div className='flex h-full items-center justify-center'>
              <p className='text-sm'>No resources available</p>
            </div>
          )}
        </div>
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
