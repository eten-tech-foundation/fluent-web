import { useMemo } from 'react';

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

export const milestonesKey = (projectId: string | number) =>
  ['milestones', String(projectId)] as const;

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

export const useGetMilestones = (projectId: string | number) => {
  return useQuery({
    queryKey: milestonesKey(projectId),
    queryFn: () => fetchMilestones(projectId),
    enabled: !!projectId,
  });
};

export const useCreateMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMilestoneInput) => createMilestone(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: milestonesKey(projectId) });
    },
  });
};

export const useUpdateMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & UpdateMilestoneInput) =>
      updateMilestone(projectId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: milestonesKey(projectId) });
    },
  });
};

export const useBookMilestoneMap = (
  milestones: Milestone[] | undefined,
  excludeMilestoneId?: number
) => {
  return useMemo(() => {
    const map: Record<number, string> = {};
    if (!milestones) return map;
    for (const m of milestones) {
      if (m.id === excludeMilestoneId) continue;
      for (const bookId of m.bookIds) {
        map[bookId] = m.name;
      }
    }
    return map;
  }, [milestones, excludeMilestoneId]);
};
