import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  useAllLanguages,
  useAvailableResources,
  useGuideContent as useGuideContentQuery,
  useImageUrls,
  useResourceCollection,
  useResourceWithAssociation,
  useResourcesByVerse,
  type Language,
} from '@/features/resources/hooks/useAquiferResources';
import { Logger } from '@/lib/services/logger';
import {
  type GuideContent,
  type ItemWithUrl,
  type ProjectItem,
  type ResourceItem,
  type ResourceName,
} from '@/lib/types';

export interface LanguageOption {
  id: number;
  code: string;
  display: string;
  englishDisplay?: string;
  itemCount: number;
  scriptDirection: 'LTR' | 'RTL';
}

// Hook for fetching available languages for a resource collection
export const useResourceLanguages = (
  selectedResource: ResourceName,
  sourceLanguageCode: string,
  sourceData: ProjectItem
) => {
  const [availableLanguages, setAvailableLanguages] = useState<LanguageOption[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const isTranslationNotes = selectedResource.id === 'UWTranslationNotes';
  const isImages = selectedResource.name === 'Images';

  // Fetch all languages
  const { data: allLanguages = [], isLoading: loadingAllLanguages } = useAllLanguages();

  // Fetch resource collection for translation notes
  const { data: collectionData, isLoading: loadingCollection } = useResourceCollection(
    selectedResource.id,
    isTranslationNotes
  );

  // Fetch available resources for images
  const { data: availableResourcesData, isLoading: loadingAvailableResources } =
    useAvailableResources(sourceData.bookCode, sourceData.chapterNumber, isImages);

  const loadingLanguages =
    loadingAllLanguages ||
    (isTranslationNotes && loadingCollection) ||
    (isImages && loadingAvailableResources);

  // Process language options whenever data changes
  useEffect(() => {
    if (!allLanguages.length) return;

    if (!isTranslationNotes && !isImages) {
      setAvailableLanguages([]);
      setSelectedLanguage('');
      return;
    }

    let languageOptions: LanguageOption[] = [];

    if (isImages && availableResourcesData) {
      languageOptions = availableResourcesData
        .filter(langData => {
          const imagesCount = langData.resourceCounts.find(rc => rc.type === 'Images');
          return imagesCount && imagesCount.count > 0;
        })
        .map(langData => {
          const langInfo = allLanguages.find((l: Language) => l.id === langData.languageId);
          const imagesCount = langData.resourceCounts.find(rc => rc.type === 'Images')?.count ?? 0;

          return {
            id: langData.languageId,
            code: langData.languageCode,
            display: langInfo?.localizedDisplay ?? langData.languageCode,
            englishDisplay: langInfo?.englishDisplay,
            itemCount: imagesCount,
            scriptDirection: langInfo?.scriptDirection
              ? (langInfo.scriptDirection as 'LTR' | 'RTL')
              : 'LTR',
          };
        });
    } else if (isTranslationNotes && collectionData) {
      languageOptions = collectionData.availableLanguages.map(availLang => {
        const langInfo = allLanguages.find((l: Language) => l.id === availLang.languageId);

        return {
          id: availLang.languageId,
          code: availLang.languageCode,
          display: langInfo?.localizedDisplay ?? availLang.displayName,
          englishDisplay: langInfo?.englishDisplay,
          itemCount: availLang.resourceItemCount,
          scriptDirection: langInfo?.scriptDirection
            ? (langInfo.scriptDirection as 'LTR' | 'RTL')
            : 'LTR',
        };
      });
    }

    // Always include source language
    const sourceLanguageInfo = allLanguages.find((l: Language) => l.code === sourceLanguageCode);
    const hasSourceLanguage = languageOptions.some(l => l.code === sourceLanguageCode);

    if (!hasSourceLanguage && sourceLanguageInfo) {
      languageOptions.unshift({
        id: sourceLanguageInfo.id,
        code: sourceLanguageInfo.code,
        display: sourceLanguageInfo.localizedDisplay,
        englishDisplay: sourceLanguageInfo.englishDisplay,
        itemCount: 0,
        scriptDirection: sourceLanguageInfo.scriptDirection as 'LTR' | 'RTL',
      });
    }

    setAvailableLanguages(languageOptions);
  }, [
    allLanguages,
    availableResourcesData,
    collectionData,
    isImages,
    isTranslationNotes,
    sourceLanguageCode,
  ]);

  const handleLanguageChange = useCallback((languageCode: string) => {
    setSelectedLanguage(languageCode);
  }, []);

  const currentLanguageDirection = useMemo(
    () => availableLanguages.find(l => l.code === selectedLanguage)?.scriptDirection ?? 'LTR',
    [availableLanguages, selectedLanguage]
  );

  return {
    availableLanguages,
    selectedLanguage,
    loadingLanguages,
    handleLanguageChange,
    currentLanguageDirection,
  };
};

// Hook for fetching resources (content for specific verse)
export const useResourceFetch = (
  selectedResource: ResourceName,
  activeVerseId: number,
  sourceData: ProjectItem,
  selectedLanguage?: string
) => {
  const isImageResource = selectedResource.name === 'Images';
  const languageCode = selectedLanguage ?? sourceData.sourceLangCode;

  // Only fetch if language is selected
  const shouldFetch = !!selectedLanguage;

  // Fetch resources based on type
  const {
    data: resourcesData,
    isLoading: loadingResources,
    error: resourcesError,
  } = useResourcesByVerse(
    {
      bookCode: sourceData.bookCode,
      startChapter: sourceData.chapterNumber,
      endChapter: sourceData.chapterNumber,
      languageCode,
      startVerse: activeVerseId,
      endVerse: activeVerseId,
      resourceType: isImageResource ? selectedResource.id : undefined,
      resourceCollectionCode: !isImageResource ? selectedResource.id : undefined,
      limit: 100,
    },
    shouldFetch
  );

  // Get text resources
  const localizeRefName = useMemo(() => {
    if (!resourcesData || isImageResource || !shouldFetch) return [];
    return resourcesData.items as ResourceItem[];
  }, [resourcesData, isImageResource, shouldFetch]);

  // For images, fetch URLs
  const imageItemsFromData = useMemo(() => {
    if (!resourcesData || !isImageResource) return [];
    return resourcesData.items;
  }, [resourcesData, isImageResource]);

  const {
    data: imageItems = [],
    isLoading: loadingImageUrls,
    error: imageUrlsError,
  } = useImageUrls(
    imageItemsFromData,
    isImageResource && shouldFetch && imageItemsFromData.length > 0
  );

  // Combine loading states
  const loadingImages = loadingResources || (isImageResource && loadingImageUrls);

  return {
    localizeRefName: shouldFetch ? localizeRefName : [],
    imageItems: (shouldFetch ? imageItems : []) as ItemWithUrl[],
    loadingImages,
    resourcesError,
    imageUrlsError,
  };
};

// Hook for managing guide content
export const useGuideContent = () => {
  const [guideContents, setGuideContents] = useState<Record<number, GuideContent>>({});
  const [loadingGuides, setLoadingGuides] = useState<Record<number, boolean>>({});
  const [relatedAudioIds, setRelatedAudioIds] = useState<Record<number, number | null>>({});
  const [fetchQueue, setFetchQueue] = useState<number[]>([]);
  const [pendingPromises, setPendingPromises] = useState<
    Record<number, Array<(value: GuideContent | undefined) => void>>
  >({});

  // Use the query for the current item in the queue
  const currentFetchId = fetchQueue.length > 0 ? fetchQueue[0] : null;
  const shouldFetch = currentFetchId !== null;

  const { data: fetchedGuideContent, isLoading: isFetchingGuide } = useGuideContentQuery(
    currentFetchId ?? 0,
    shouldFetch
  );

  // Process fetched content
  useEffect(() => {
    if (fetchedGuideContent && currentFetchId !== null) {
      setGuideContents(prev => ({ ...prev, [currentFetchId]: fetchedGuideContent }));
      setLoadingGuides(prev => ({ ...prev, [currentFetchId]: false }));

      // Resolve all pending promises for this ID
      if (currentFetchId in pendingPromises) {
        pendingPromises[currentFetchId].forEach(resolve => resolve(fetchedGuideContent));
        setPendingPromises(prev => {
          const updated = { ...prev };
          delete updated[currentFetchId];
          return updated;
        });
      }

      setFetchQueue(prev => prev.slice(1));
    }
  }, [fetchedGuideContent, currentFetchId, pendingPromises]);

  // Update loading state when fetching
  useEffect(() => {
    if (currentFetchId !== null && isFetchingGuide) {
      setLoadingGuides(prev => ({ ...prev, [currentFetchId]: true }));
    }
  }, [currentFetchId, isFetchingGuide]);

  const fetchGuideContent = useCallback(
    async (id: number): Promise<GuideContent | undefined> => {
      // Check if already fetched
      if (id in guideContents) {
        return guideContents[id];
      }

      // Create a promise that will be resolved when the content is fetched
      const promise = new Promise<GuideContent | undefined>(resolve => {
        // Add resolver to pending promises
        setPendingPromises(prev => ({
          ...prev,
          [id]: [...(prev[id] ?? []), resolve],
        }));

        // Add to queue if not already there
        setFetchQueue(prev => {
          if (prev.includes(id)) return prev;
          return [...prev, id];
        });

        setLoadingGuides(prev => ({ ...prev, [id]: true }));

        // Timeout after 10 seconds
        setTimeout(() => {
          resolve(undefined);
        }, 10000);
      });

      return promise;
    },
    [guideContents]
  );

  const fetchRelatedAudio = useCallback(
    async (
      localizedName: string,
      collectionCode: string,
      allResources: ResourceItem[]
    ): Promise<number | undefined> => {
      const audioItem = allResources.find(
        item =>
          item.localizedName === localizedName &&
          item.mediaType === 'Audio' &&
          item.grouping.collectionCode === collectionCode
      );

      if (audioItem) {
        await fetchGuideContent(audioItem.id);
      }

      return audioItem?.id;
    },
    [fetchGuideContent]
  );

  return {
    guideContents,
    loadingGuides,
    relatedAudioIds,
    setRelatedAudioIds,
    fetchGuideContent,
    fetchRelatedAudio,
  };
};

// Hook for resource dialog
export const useResourceDialog = () => {
  const [resourceDialog, setResourceDialog] = useState<GuideContent | null>(null);
  const [resourceError, setResourceError] = useState(false);
  const [currentResourceId, setCurrentResourceId] = useState<number | null>(null);
  const [currentParentId, setCurrentParentId] = useState<number | null>(null);

  const shouldFetchWithAssociation = currentResourceId !== null && currentParentId !== null;
  const shouldFetchDirect = currentResourceId !== null && currentParentId === null;

  // Fetch resource with association when needed
  const {
    data: resourceWithAssociation,
    isLoading: isLoadingAssociation,
    error: associationError,
  } = useResourceWithAssociation(
    currentResourceId ?? 0,
    currentParentId ?? 0,
    shouldFetchWithAssociation
  );

  // Fetch direct guide content when no parent
  const {
    data: directGuideContent,
    isLoading: isLoadingDirect,
    error: directError,
  } = useGuideContentQuery(currentResourceId ?? 0, shouldFetchDirect);

  const loadingResourceDialog = isLoadingAssociation || isLoadingDirect;

  // Update dialog when data is fetched
  useEffect(() => {
    if (resourceWithAssociation) {
      setResourceDialog(resourceWithAssociation);
      setResourceError(false);
    }
  }, [resourceWithAssociation]);

  useEffect(() => {
    if (directGuideContent) {
      setResourceDialog(directGuideContent);
      setResourceError(false);
    }
  }, [directGuideContent]);

  // Handle errors
  useEffect(() => {
    const error = associationError ?? directError;
    if (error) {
      Logger.logException(error, { context: 'Error fetching resource dialog content' });
      setResourceError(true);
      if (currentResourceId !== null) {
        // Create an empty GuideContent object as fallback
        setResourceDialog({
          id: currentResourceId,
          name: '',
          localizedName: '',
          content: [], // Empty array matches GuideContentData type (ContentItem[] | AudioContent)
          grouping: {
            collectionCode: '',
          },
        });
      }
    }
  }, [associationError, directError, currentResourceId]);

  const handleResourceClick = useCallback(
    (resourceId: number, parentResourceId?: number | null) => {
      setResourceDialog(null);
      setResourceError(false);
      setCurrentResourceId(resourceId);
      setCurrentParentId(parentResourceId ?? null);
    },
    []
  );

  const closeDialog = useCallback(() => {
    setResourceDialog(null);
    setResourceError(false);
    setCurrentResourceId(null);
    setCurrentParentId(null);
  }, []);

  return {
    resourceDialog,
    loadingResourceDialog,
    resourceError,
    handleResourceClick,
    closeDialog,
  };
};
