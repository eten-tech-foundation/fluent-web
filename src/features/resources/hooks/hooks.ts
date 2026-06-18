import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  useAllLanguages,
  useAquiferBibleText,
  useAquiferBibles,
  useAvailableResources,
  useGuideContent as useGuideContentQuery,
  useImageUrls,
  useResourceAssociations,
  useResourceCollection,
  useResourceWithAssociation,
  useResourcesByVerse,
  type AquiferBible,
  type AquiferBibleTextResponse,
  type AquiferChapter,
  type AquiferVerse,
  type Language,
  type PassageAssociation,
} from '@/features/resources/hooks/useAquiferResources';
import {
  useYouVersionBibles,
  useYouVersionChapterMeta,
  useYouVersionChapterText,
  type YouVersionBible,
  type YouVersionChapterResponse,
} from '@/features/resources/hooks/useYouVersion';
import { Logger } from '@/lib/services/logger';
import {
  type GuideContent,
  type ItemWithUrl,
  type ProjectItem,
  type ResourceItem,
  type ResourceName,
} from '@/lib/types';

export { useResourceAssociations, type PassageAssociation };

export interface LanguageOption {
  id: number;
  code: string;
  display: string;
  englishDisplay?: string;
  itemCount: number;
  scriptDirection: 'LTR' | 'RTL';
}

export type BibleSource = 'aquifer' | 'youversion';

export interface UnifiedBible {
  id: string;
  name: string;
  abbreviation: string;
  source: BibleSource;
  rawId: number;
}

export interface BibleVerse {
  verseNumber: number;
  text: string;
}

export const useResourceLanguages = (
  selectedResource: ResourceName,
  sourceLanguageCode: string,
  sourceData: ProjectItem
) => {
  const [availableLanguages, setAvailableLanguages] = useState<LanguageOption[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const isBibleResource = selectedResource.id === 'Bibles';
  const isImages = selectedResource.id === 'Images';
  // UW resources (TN, TQ, TW) use the collection endpoint
  const isUWResources = !isImages && !isBibleResource;

  // Fetch all languages
  const { data: allLanguages = [], isLoading: loadingAllLanguages } = useAllLanguages();

  // Fetch uW resources(tN,tQ,tW) collection from Aquifer
  const { data: collectionData, isLoading: loadingCollection } = useResourceCollection(
    selectedResource.id,
    isUWResources
  );

  // Fetch available resources for images
  const { data: availableResourcesData, isLoading: loadingAvailableResources } =
    useAvailableResources(sourceData.bookCode, sourceData.chapterNumber, isImages);

  const loadingLanguages =
    loadingAllLanguages ||
    (isUWResources && loadingCollection) ||
    (isImages && loadingAvailableResources);

  // Process language options whenever data changes
  useEffect(() => {
    if (!allLanguages.length) return;

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
    } else if (isUWResources && collectionData) {
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
    } else if (isBibleResource) {
      // For Bibles, expose all known languages — both APIs accept any language code.
      // If a language has no bibles the list will be empty and the panel shows the
      // "No Bibles are currently available." empty state.
      languageOptions = allLanguages.map((l: Language) => ({
        id: l.id,
        code: l.code,
        display: l.localizedDisplay,
        englishDisplay: l.englishDisplay,
        itemCount: 0,
        scriptDirection: l.scriptDirection as 'LTR' | 'RTL',
      }));
    } else {
      setAvailableLanguages([]);
      setSelectedLanguage('');
      return;
    }

    // Always ensure the source language appears at the top of the list
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
    isBibleResource,
    isImages,
    isUWResources,
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

// useResourceFetch
export const useResourceFetch = (
  selectedResource: ResourceName,
  activeVerseId: number,
  sourceData: ProjectItem,
  selectedLanguage?: string
) => {
  const isImageResource = selectedResource.id === 'Images';
  const isBibleResource = selectedResource.id === 'Bibles';
  const languageCode = selectedLanguage ?? sourceData.sourceLangCode;

  // Bibles use their own fetch path — skip the generic verse-search endpoint
  const shouldFetch = !!selectedLanguage && !isBibleResource;

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
          content: [],
          grouping: { collectionCode: '' },
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

// useBibleResources
export const useBibleResources = (
  selectedLanguage: string,
  bookCode: string,
  chapterNumber: number,
  enabled: boolean = true
) => {
  const [selectedBible, setSelectedBible] = useState<UnifiedBible | null>(null);
  const shouldFetchLists = enabled && !!selectedLanguage;

  const { data: aquiferBibles = [], isLoading: loadingAquiferBibles } = useAquiferBibles(
    selectedLanguage,
    shouldFetchLists
  );

  const { data: yvBibles = [], isLoading: loadingYVBibles } = useYouVersionBibles(
    selectedLanguage,
    shouldFetchLists
  );

  const loadingBibles = loadingAquiferBibles || loadingYVBibles;

  // Sort each source alphabetically by name, then merge into one list.
  const unifiedBibles: UnifiedBible[] = useMemo(() => {
    const fromAquifer: UnifiedBible[] = aquiferBibles.map((b: AquiferBible) => ({
      id: `aq-${b.id}`,
      name: b.name,
      abbreviation: b.abbreviation,
      source: 'aquifer' as BibleSource,
      rawId: b.id,
    }));

    const fromYouVersion: UnifiedBible[] = yvBibles.map((b: YouVersionBible) => ({
      id: `yv-${b.id}`,
      name: b.title,
      abbreviation: b.abbreviation,
      source: 'youversion' as BibleSource,
      rawId: b.id,
    }));

    return [...fromAquifer, ...fromYouVersion].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [aquiferBibles, yvBibles]);

  // Aquifer content

  const isAquifer = selectedBible?.source === 'aquifer';

  const { data: aquiferBibleText, isLoading: loadingAquiferText } = useAquiferBibleText(
    isAquifer ? selectedBible.rawId : null,
    bookCode,
    chapterNumber,
    isAquifer
  );

  // YouVersion content
  // Step 1: fetch chapter meta to get the ordered verse passage_id list.
  // Step 2: fan out one passage fetch per verse via useYouVersionChapterText.

  const isYouVersion = selectedBible?.source === 'youversion';
  const youVersionChapterId = chapterNumber;

  const { data: yvChapterMeta, isLoading: loadingYVMeta } = useYouVersionChapterMeta(
    isYouVersion ? selectedBible.rawId : null,
    bookCode,
    youVersionChapterId,
    isYouVersion
  );

  const yvPassageResults = useYouVersionChapterText(
    isYouVersion ? selectedBible.rawId : null,
    yvChapterMeta,
    isYouVersion && !loadingYVMeta
  );

  const loadingYVText = loadingYVMeta || yvPassageResults.some(r => r.isLoading);

  const loadingBibleContent = loadingAquiferText || loadingYVText;

  // Normalise to a flat verse list

  const bibleVerses: BibleVerse[] = useMemo(() => {
    if (isAquifer && aquiferBibleText) {
      const chapter = (aquiferBibleText as AquiferBibleTextResponse).chapters.find(
        (c: AquiferChapter) => c.number === chapterNumber
      );
      return (
        chapter?.verses.map((v: AquiferVerse) => ({
          verseNumber: v.number,
          text: v.text,
        })) ?? []
      );
    }

    if (isYouVersion && yvChapterMeta && yvPassageResults.length > 0) {
      const verses: BibleVerse[] = [];

      yvPassageResults.forEach((result, index) => {
        if (result.data) {
          const verseMeta = (yvChapterMeta as YouVersionChapterResponse).verses[index];
          const passageId = verseMeta.passage_id;
          // passage_id format: "GEN.1.5" — verse number is the third segment
          const verseNumber = parseInt(passageId.split('.')[2] ?? '0', 10);

          if (verseNumber > 0) {
            verses.push({ verseNumber, text: result.data.content });
          }
        }
      });

      // Sort ascending by verse number — fan-out results may arrive out of order
      return verses.sort((a, b) => a.verseNumber - b.verseNumber);
    }

    return [];
  }, [isAquifer, isYouVersion, aquiferBibleText, yvChapterMeta, yvPassageResults, chapterNumber]);

  // Handlers

  const handleBibleChange = useCallback(
    (bibleId: string) => {
      const found = unifiedBibles.find(b => b.id === bibleId) ?? null;
      setSelectedBible(found);
    },
    [unifiedBibles]
  );

  // Called when the Bible tab is closed so state is fully reset and the tab
  // cannot be restored after a workspace reload.
  const clearSelectedBible = useCallback(() => {
    setSelectedBible(null);
  }, []);

  return {
    unifiedBibles,
    loadingBibles,
    loadingBibleContent,
    selectedBible,
    handleBibleChange,
    clearSelectedBible,
    bibleVerses,
  };
};
