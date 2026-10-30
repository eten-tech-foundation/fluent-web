import { useMemo } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchOrNetworkError } from '@/lib/api-utils';
import { config } from '@/lib/config';

import {
  UsfmImportConflictError,
  UsfmImportRejectedError,
  type UsfmFileUpload,
  type UsfmFileVerdict,
} from '../lib/usfm-import';

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

export interface ImportUsfmMilestoneInput {
  name: string;
  files: UsfmFileUpload[];
}

/**
 * Creates one milestone from USFM files (#419). A refused file comes back as
 * UsfmImportRejectedError with every file's verdict; a book the project gained after the upload
 * check comes back as UsfmImportConflictError.
 */
const importUsfmMilestone = async (
  projectId: string | number,
  input: ImportUsfmMilestoneInput
): Promise<Milestone> => {
  const res = await fetchOrNetworkError(
    `${config.api.url}/projects/${projectId}/milestones/import`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  if (res.ok) return (await res.json()) as Milestone;

  const body = (await res.json().catch(() => null)) as {
    message?: string;
    files?: UsfmFileVerdict[];
  } | null;
  if (res.status === 400 && body?.files) throw new UsfmImportRejectedError(body.files);
  if (res.status === 409) {
    throw new UsfmImportConflictError(body?.message ?? 'A book in this import is in the project');
  }
  throw new Error(body?.message ?? 'Failed to import the milestone');
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

export const useImportUsfmMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportUsfmMilestoneInput) => importUsfmMilestone(projectId, input),
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
