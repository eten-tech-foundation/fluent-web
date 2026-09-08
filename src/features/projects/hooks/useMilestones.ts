import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import type { ChapterStatusCounts } from '@/lib/types';

export type ProjectUnitStatus = 'not_started' | 'active' | 'completed' | 'archived';

export interface Milestone {
  id: number;
  projectId: number;
  name: string;
  type: string;
  connectivityProfile: string | null;
  status: ProjectUnitStatus;
  createdAt: string | null;
  updatedAt: string | null;
  bookCount?: number;
  chapterStatusCounts?: ChapterStatusCounts;
}

export interface CreateMilestoneInput {
  name: string;
  type: string;
  status?: ProjectUnitStatus;
  bibleId: number;
  bookIds: number[];
}

export interface UpdateMilestoneInput {
  name?: string;
  type?: string;
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

const updateMilestone = async (id: number, input: UpdateMilestoneInput): Promise<Milestone> => {
  const res = await fetch(`${config.api.url}/milestones/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to update milestone');
  return (await res.json()) as Milestone;
};

const deleteMilestone = async (id: number): Promise<void> => {
  const res = await fetch(`${config.api.url}/milestones/${id}`, {
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
      updateMilestone(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
    },
  });
};

export const useDeleteMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMilestone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
    },
  });
};
