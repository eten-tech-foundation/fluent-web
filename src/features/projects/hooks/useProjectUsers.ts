import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';

export interface ProjectUser {
  projectId: number;
  userId: number;
  displayName: string;
  roleID: number;
  addedAt: string | null;
}

interface ApiErrorResponse {
  message?: string;
}

const parseErrorMessage = async (res: Response, fallback: string): Promise<never> => {
  const error = (await res.json().catch(() => null)) as ApiErrorResponse | null;
  throw new Error(error?.message ?? fallback);
};
// -------------------------
// --- Fetch functions   ---
// -------------------------

const fetchProjectUsers = async (projectId: number, email: string): Promise<ProjectUser[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch project users');

  return (await res.json()) as ProjectUser[];
};
const addProjectUsers = async (
  projectId: number,
  userIds: number[],
  email: string
): Promise<ProjectUser[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
    body: JSON.stringify({ userIds }),
  });

  if (!res.ok) await parseErrorMessage(res, 'Failed to add users to project');
  return (await res.json()) as ProjectUser[];
};

const removeProjectUser = async (
  projectId: number,
  userId: number,
  email: string
): Promise<void> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
  });

  if (!res.ok) {
    await parseErrorMessage(res, 'Failed to remove user from project');
  }
};

// -------------------------
// --- Hooks             ---
// -------------------------

export const useProjectUsers = (
  projectId: number,
  email: string,
  options?: { enabled?: boolean }
) => {
  return useQuery<ProjectUser[]>({
    queryKey: ['projectUsers', projectId, email],
    queryFn: () => fetchProjectUsers(projectId, email),
    enabled: (options?.enabled ?? true) && !!projectId && !!email,
  });
};

export const useAddProjectUsers = (projectId: number, email: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userIds }: { userIds: number[] }) => addProjectUsers(projectId, userIds, email),
    onSuccess: newUsers => {
      queryClient.setQueryData<ProjectUser[]>(['projectUsers', projectId, email], prev => {
        const existing = prev ?? [];
        return [...existing, ...newUsers].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['projectUsers', projectId, email] });
    },
  });
};

export const useRemoveProjectUser = (projectId: number, email: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: { userId: number }) => removeProjectUser(projectId, userId, email),
    onSuccess: (_data, { userId }) => {
      queryClient.setQueryData<ProjectUser[]>(['projectUsers', projectId, email], prev =>
        prev ? prev.filter(u => u.userId !== userId) : []
      );
    },
  });
};
