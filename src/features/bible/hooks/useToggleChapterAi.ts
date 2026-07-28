import { useMutation, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';

interface UpdateAiStatusPayload {
  isAiEnabled: boolean;
}

export function useToggleChapterAi(chapterAssignmentId: number, projectId: string | number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isAiEnabled: boolean) => {
      const url = `${config.api.url}/chapter-assignments/${chapterAssignmentId}/ai-status`;
      const res = await fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isAiEnabled } as UpdateAiStatusPayload),
      });

      if (!res.ok) {
        throw new Error(`Failed to update AI status: ${res.statusText}`);
      }

      return (await res.json()) as unknown;
    },
    onSuccess: () => {
      // Invalidate the project details and assignments so the updated `isAiEnabled` status is fetched
      void queryClient.invalidateQueries({
        queryKey: ['projectDetails', String(projectId)],
      });
      void queryClient.invalidateQueries({
        queryKey: ['chapterAssignments', String(projectId)],
      });
      void queryClient.invalidateQueries({
        queryKey: ['userChapterAssignments'],
      });
    },
  });
}
