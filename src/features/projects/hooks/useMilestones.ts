import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';

export type ProjectUnitStatus = 'not_started' | 'in_progress' | 'completed';
export type MilestoneType = 'text' | 'audio';

export interface Milestone {
  id: number;
  name: string;
  status: ProjectUnitStatus;
  type: MilestoneType;
  projectId: number;
  projectName: string;
  milestoneCount: number;
  bookCount: number;
  bookIds: number[];
  chapterStatusCounts: Record<string, number>;
  updatedAt?: string;
}

export interface CreateMilestoneInput {
  name: string;
  type?: MilestoneType;
  status?: ProjectUnitStatus;
  bookIds: number[];
}

export interface UpdateMilestoneInput {
  name?: string;
  type?: MilestoneType;
  status?: ProjectUnitStatus;
  bibleId?: number;
  addBooks?: number[];
  removeBooks?: number[];
  moveBooks?: Array<{ bookId: number; targetMilestoneId: number }>;
}

const fetchMilestones = async (projectId: string | number): Promise<Milestone[]> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/milestones`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to fetch milestones');
  return (await res.json()) as Milestone[];
};

const createMilestone = async (
  projectId: string | number,
  input: CreateMilestoneInput
): Promise<Milestone> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/milestones`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create milestone');
  return (await res.json()) as Milestone;
};

const updateMilestone = async (
  projectId: string | number,
  id: number,
  input: UpdateMilestoneInput
): Promise<Milestone> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/milestones/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to update milestone');
  return (await res.json()) as Milestone;
};

const deleteMilestone = async (projectId: string | number, id: number): Promise<void> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}/milestones/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete milestone');
};

export const useGetMilestones = (projectId: string | number) => {
  return useQuery({
    queryKey: ['milestones', projectId],
    queryFn: () => fetchMilestones(projectId),
    enabled: !!projectId,
  });
};

export const useCreateMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMilestoneInput) => createMilestone(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
    },
  });
};

export const useUpdateMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & UpdateMilestoneInput) =>
      updateMilestone(projectId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
    },
  });
};

export const useDeleteMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMilestone(projectId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
    },
  });
};
