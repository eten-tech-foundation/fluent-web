import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type ChapterAssignmentProgress, type UserChapterAssignment } from '@/lib/types';

export interface AssignSelectedItem {
  chapterAssignmentId: number;
  drafterId: number | null;
  peerCheckerId: number | null;
}

export interface AssignChapterPayload {
  assignments: AssignSelectedItem[];
}

export interface ChapterAssignmentsByUser {
  assignedChapters: UserChapterAssignment[];
  peerCheckChapters: UserChapterAssignment[];
}

const fetchChapterAssignments = async (projectId: string): Promise<ChapterAssignmentProgress[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/chapter-assignments/progress`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch chapter assignments');

  return (await res.json()) as ChapterAssignmentProgress[];
};
const fetchChapterAssignmentsByUserId = async (
  userId: number
): Promise<ChapterAssignmentsByUser> => {
  const res = await fetch(`${config.api.url}/users/${userId}/chapter-assignments`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch user chapter assignments');

  return (await res.json()) as ChapterAssignmentsByUser;
};

const assignChaptersToUser = async (
  payload: AssignChapterPayload & { projectId: string }
): Promise<UserChapterAssignment[]> => {
  const { projectId, assignments } = payload;

  const response = await fetch(
    `${config.api.url}/projects/${projectId}/chapter-assignments/assign-selected`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignments }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to assign chapters');
  }

  return (await response.json()) as UserChapterAssignment[];
};

export const useChapterAssignments = (projectId: string) => {
  return useQuery<ChapterAssignmentProgress[]>({
    queryKey: ['chapterAssignments', projectId],
    queryFn: () => fetchChapterAssignments(projectId),
    enabled: !!projectId,
  });
};

export const useChapterAssignmentsByUserId = (userId: number, orgId?: number | null) => {
  return useQuery<ChapterAssignmentsByUser>({
    queryKey: ['userChapterAssignments', userId, orgId],
    queryFn: () => fetchChapterAssignmentsByUserId(userId),
    enabled: !!userId,
  });
};

export const useAssignChapters = (
  projectId: string,
  assignedUserName?: string,
  peerCheckerName?: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: assignChaptersToUser,
    onMutate: async variables => {
      await queryClient.cancelQueries({
        queryKey: ['chapterAssignments', projectId],
      });

      const previousAssignments = queryClient.getQueryData<ChapterAssignmentProgress[]>([
        'chapterAssignments',
        projectId,
      ]);

      if (previousAssignments) {
        const updatedAssignments = previousAssignments.map(assignment => {
          const item = variables.assignments.find(
            a => a.chapterAssignmentId === assignment.assignmentId
          );
          if (!item) return assignment;

          return {
            ...assignment,
            assignedUser:
              item.drafterId !== null && assignedUserName
                ? { id: item.drafterId, displayName: assignedUserName }
                : null,
            peerChecker:
              item.peerCheckerId !== null && peerCheckerName
                ? { id: item.peerCheckerId, displayName: peerCheckerName }
                : null,
            status: assignment.status === 'not_started' ? 'draft' : assignment.status,
          };
        });

        queryClient.setQueryData(['chapterAssignments', projectId], updatedAssignments);
      }

      return { previousAssignments };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousAssignments) {
        queryClient.setQueryData(['chapterAssignments', projectId], context.previousAssignments);
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['chapterAssignments', projectId],
      });

      // Invalidate user assignment caches for every unique user touched
      const affectedUserIds = new Set<number>();
      variables.assignments.forEach(a => {
        if (a.drafterId !== null) affectedUserIds.add(a.drafterId);
        if (a.peerCheckerId !== null) affectedUserIds.add(a.peerCheckerId);
      });
      affectedUserIds.forEach(userId => {
        void queryClient.invalidateQueries({
          queryKey: ['userChapterAssignments', userId],
        });
      });

      void queryClient.invalidateQueries({
        queryKey: ['projectDetails', projectId],
      });
    },
  });
};
