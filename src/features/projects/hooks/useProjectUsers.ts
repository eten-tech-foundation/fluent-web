import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';

export interface ProjectUser {
  projectId: number;
  userId: number;
  displayName: string;
  roleID: number;
  roleName: string;
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

const fetchProjectUsers = async (projectId: number): Promise<ProjectUser[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch project users');

  return (await res.json()) as ProjectUser[];
};
const addProjectUsers = async (
  projectId: number,
  userIds: number[],
  roleName: string
): Promise<ProjectUser[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userIds, roleName }),
  });

  if (!res.ok) await parseErrorMessage(res, 'Failed to add users to project');
  return (await res.json()) as ProjectUser[];
};

const removeProjectUser = async (projectId: number, userId: number): Promise<void> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    await parseErrorMessage(res, 'Failed to remove user from project');
  }
};

// -------------------------
// --- Hooks             ---
// -------------------------

export const useProjectUsers = (projectId: number, options?: { enabled?: boolean }) => {
  return useQuery<ProjectUser[]>({
    queryKey: ['projectUsers', projectId],
    queryFn: () => fetchProjectUsers(projectId),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
};

export const useAddProjectUsers = (projectId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userIds, roleName }: { userIds: number[]; roleName: string }) =>
      addProjectUsers(projectId, userIds, roleName),
    onSuccess: newUsers => {
      queryClient.setQueryData<ProjectUser[]>(['projectUsers', projectId], prev => {
        const existing = prev ?? [];
        return [...existing, ...newUsers].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['projectUsers', projectId] });
    },
  });
};

export const useRemoveProjectUser = (projectId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: { userId: number }) => removeProjectUser(projectId, userId),
    onSuccess: (_data, { userId }) => {
      queryClient.setQueryData<ProjectUser[]>(['projectUsers', projectId], prev =>
        prev ? prev.filter(u => u.userId !== userId) : []
      );
    },
  });
};

const updateProjectUserRole = async (
  projectId: number,
  userId: number,
  roleName: string
): Promise<ProjectUser> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/users/${userId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ roleName }),
  });

  if (!res.ok) await parseErrorMessage(res, 'Failed to update user role');
  return (await res.json()) as ProjectUser;
};

export const useUpdateProjectUserRole = (projectId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roleName }: { userId: number; roleName: string }) =>
      updateProjectUserRole(projectId, userId, roleName),
    onSuccess: (_updatedUser, { userId, roleName }) => {
      queryClient.setQueryData<ProjectUser[]>(['projectUsers', projectId], prev =>
        prev ? prev.map(u => (u.userId === userId ? { ...u, roleName } : u)) : []
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['projectUsers', projectId] });
    },
  });
};
