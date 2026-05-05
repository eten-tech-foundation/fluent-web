import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

export interface FetchResourceState {
  activeResource: string;
  languageCode: string;
  tabStatus: boolean;
}

interface ResourceState {
  resources: {
    bookCode: string;
    chapterNumber: number;
    verseNumber: number;
    activeResource: string;
    languageCode: string;
    tabStatus: boolean;
  };
}

interface SaveResourceStateParams {
  chapterAssignmentId: number;
  resourceState: ResourceState;
  email: string;
}

// Fetch resource state
const fetchResourceState = async (
  chapterAssignmentId: number,
  email: string
): Promise<FetchResourceState | null> => {
  const response = await fetch(
    `${config.api.url}/chapter-assignments/${chapterAssignmentId}/editor-state`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': email,
      },
    }
  );
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch resource state');
  }
  return (await response.json()) as FetchResourceState | null;
};

// Save resource state
const saveResourceState = async ({
  chapterAssignmentId,
  resourceState,
  email,
}: SaveResourceStateParams): Promise<void> => {
  const response = await fetch(
    `${config.api.url}/chapter-assignments/${chapterAssignmentId}/editor-state`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': email,
      },
      body: JSON.stringify(resourceState),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to save resource state');
  }
};

// Hook to fetch resource state
export const useResourceState = (chapterAssignmentId: number, email: string) => {
  return useQuery<FetchResourceState | null>({
    queryKey: ['resource-state', chapterAssignmentId],
    queryFn: () => fetchResourceState(chapterAssignmentId, email),
    enabled: !!chapterAssignmentId && !!email,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
};

// Hook to save resource state
export const useSaveResourceState = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveResourceState,
    onSuccess: (_, variables) => {
      // Update cache with the flat structure (matching GET response)
      queryClient.setQueryData<FetchResourceState | null>(
        ['resource-state', variables.chapterAssignmentId],
        variables.resourceState.resources
      );
    },
    onError: error => {
      Logger.logException(error, { context: 'Error saving resource state' });
    },
  });
};
