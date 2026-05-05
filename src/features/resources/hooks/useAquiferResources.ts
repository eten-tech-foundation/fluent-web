import { useQuery } from '@tanstack/react-query';

import { config, getApiHeaders } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import type { GuideContent, ItemWithUrl } from '@/lib/types';

const API_BASE_URL = config.api.aquifer_url;

// Types
export interface Language {
  id: number;
  code: string;
  englishDisplay: string;
  localizedDisplay: string;
  scriptDirection: string;
}

export interface AvailableLanguage {
  languageId: number;
  languageCode: string;
  displayName: string;
  resourceItemCount: number;
}

export interface ResourceCollectionResponse {
  code: string;
  displayName: string;
  availableLanguages: AvailableLanguage[];
}

export interface LanguageResourceCount {
  languageId: number;
  languageCode: string;
  resourceCounts: Array<{
    type: string;
    count: number;
  }>;
}

export interface ResourceItem {
  id: number;
  localizedName: string;
  mediaType: string;
  grouping: {
    collectionCode?: string;
    name?: string;
  };
}

export interface ResourceDetailsResponse {
  content?: {
    url?: string;
  };
}

export interface FetchResourcesResponse {
  items: unknown[];
}

export interface AssociationResponse {
  resourceAssociations?: Array<{
    referenceId: number;
    contentId: number;
  }>;
}

// Fetch functions
const fetchAllLanguages = async (): Promise<Language[]> => {
  const response = await fetch(`${API_BASE_URL}/languages`, {
    method: 'GET',
    mode: 'cors',
    headers: getApiHeaders(),
  });

  if (!response.ok) throw new Error('Failed to fetch languages');
  return (await response.json()) as Language[];
};

const fetchResourceCollection = async (resourceId: string): Promise<ResourceCollectionResponse> => {
  const response = await fetch(`${API_BASE_URL}/resources/collections/${resourceId}`, {
    method: 'GET',
    mode: 'cors',
    headers: getApiHeaders(),
  });

  if (!response.ok) throw new Error('Failed to fetch resource collection');
  return (await response.json()) as ResourceCollectionResponse;
};

const fetchAvailableResources = async (
  bookCode: string,
  startChapter: number,
  endChapter: number,
  startVerse: number = 1,
  endVerse: number = 200
): Promise<LanguageResourceCount[]> => {
  const response = await fetch(
    `${API_BASE_URL}/languages/available-resources?bookcode=${bookCode}&StartChapter=${startChapter}&StartVerse=${startVerse}&EndVerse=${endVerse}&EndChapter=${endChapter}`,
    {
      method: 'GET',
      mode: 'cors',
      headers: getApiHeaders(),
    }
  );

  if (!response.ok) throw new Error('Failed to fetch available resources');
  return (await response.json()) as LanguageResourceCount[];
};

const fetchResourcesByVerse = async (params: {
  bookCode: string;
  startChapter: number;
  endChapter: number;
  languageCode: string;
  startVerse: number;
  endVerse: number;
  resourceType?: string;
  resourceCollectionCode?: string;
  limit?: number;
}): Promise<FetchResourcesResponse> => {
  const {
    bookCode,
    startChapter,
    endChapter,
    languageCode,
    startVerse,
    endVerse,
    resourceType,
    resourceCollectionCode,
    limit = 100,
  } = params;

  let url = `${API_BASE_URL}/resources/search?BookCode=${bookCode}&StartChapter=${startChapter}&EndChapter=${endChapter}&LanguageCode=${languageCode}&StartVerse=${startVerse}&EndVerse=${endVerse}&Limit=${limit}`;

  if (resourceType) {
    url += `&ResourceType=${resourceType}`;
  }

  if (resourceCollectionCode) {
    url += `&ResourceCollectionCode=${resourceCollectionCode}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    headers: getApiHeaders(),
  });

  if (!response.ok) throw new Error('Failed to fetch resources');
  return (await response.json()) as FetchResourcesResponse;
};

const fetchResourceDetails = async (resourceId: number): Promise<ResourceDetailsResponse> => {
  const response = await fetch(`${API_BASE_URL}/resources/${resourceId}`, {
    method: 'GET',
    mode: 'cors',
    headers: getApiHeaders(),
  });

  if (!response.ok) throw new Error('Failed to fetch resource details');
  return (await response.json()) as ResourceDetailsResponse;
};

const fetchGuideContent = async (resourceId: number): Promise<GuideContent> => {
  const response = await fetch(`${API_BASE_URL}/resources/${resourceId}`, {
    method: 'GET',
    mode: 'cors',
    headers: getApiHeaders(),
  });

  if (!response.ok) throw new Error('Failed to fetch guide content');
  return (await response.json()) as GuideContent;
};

const fetchResourceAssociations = async (
  parentResourceId: number
): Promise<AssociationResponse> => {
  const response = await fetch(`${API_BASE_URL}/resources/${parentResourceId}/associations`, {
    method: 'GET',
    mode: 'cors',
    headers: getApiHeaders(),
  });

  if (!response.ok) throw new Error('Failed to fetch resource associations');
  return (await response.json()) as AssociationResponse;
};

const fetchImageUrls = async (items: unknown[]): Promise<ItemWithUrl[]> => {
  const itemsWithUrls: ItemWithUrl[] = await Promise.all(
    items.map(async (item: unknown) => {
      const resourceItem = item as ItemWithUrl;
      try {
        const response = await fetch(`${API_BASE_URL}/resources/${resourceItem.id}`, {
          method: 'GET',
          mode: 'cors',
          headers: getApiHeaders(),
        });

        if (!response.ok) throw new Error('Failed to fetch content URL');

        const details = (await response.json()) as ResourceDetailsResponse;
        return {
          ...resourceItem,
          url: details.content?.url ?? '',
          thumbnailUrl: details.content?.url,
        };
      } catch (e) {
        Logger.logException(e, { context: `Error fetching image URL for item ${resourceItem.id}` });
        return { ...resourceItem, url: '', thumbnailUrl: '' };
      }
    })
  );

  return itemsWithUrls.filter(item => item.url);
};

const fetchResourceWithAssociation = async (
  resourceId: number,
  parentResourceId: number
): Promise<GuideContent> => {
  const associations = await fetchResourceAssociations(parentResourceId);

  const matchingAssociation = associations.resourceAssociations?.find(
    assoc => Number(assoc.referenceId) === Number(resourceId)
  );

  if (!matchingAssociation?.contentId) {
    throw new Error('Resource association not found');
  }

  return fetchGuideContent(matchingAssociation.contentId);
};

// React Query Hooks
export const useAllLanguages = () => {
  return useQuery({
    queryKey: ['all-languages'],
    queryFn: fetchAllLanguages,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useResourceCollection = (resourceId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['resource-collection', resourceId],
    queryFn: () => fetchResourceCollection(resourceId),
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useAvailableResources = (
  bookCode: string,
  chapterNumber: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['available-resources', bookCode, chapterNumber],
    queryFn: () => fetchAvailableResources(bookCode, chapterNumber, chapterNumber),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useResourcesByVerse = (
  params: {
    bookCode: string;
    startChapter: number;
    endChapter: number;
    languageCode: string;
    startVerse: number;
    endVerse: number;
    resourceType?: string;
    resourceCollectionCode?: string;
    limit?: number;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['resources-by-verse', params],
    queryFn: () => fetchResourcesByVerse(params),
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useResourceDetails = (resourceId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['resource-details', resourceId],
    queryFn: () => fetchResourceDetails(resourceId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useGuideContent = (resourceId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['guide-content', resourceId],
    queryFn: () => fetchGuideContent(resourceId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useResourceAssociations = (parentResourceId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['resource-associations', parentResourceId],
    queryFn: () => fetchResourceAssociations(parentResourceId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useImageUrls = (items: unknown[], enabled: boolean = true) => {
  return useQuery({
    queryKey: ['image-urls', items.map((item: unknown) => (item as { id?: number }).id).join(',')],
    queryFn: () => fetchImageUrls(items),
    enabled: enabled && items.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useResourceWithAssociation = (
  resourceId: number,
  parentResourceId: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['resource-with-association', resourceId, parentResourceId],
    queryFn: () => fetchResourceWithAssociation(resourceId, parentResourceId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
};
