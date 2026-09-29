import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { type ProjectItem, type TargetVerse, type VerseData } from '@/lib/types';
import { useAppStore } from '@/store/store';

export interface TargetText extends TargetVerse {
  id: number;
  bibleTextId: number;
  projectUnitId: number;
}

export const fetchTargetText = async (
  projectUnitId: number,
  bookId: number,
  chapterNumber: number
): Promise<TargetText[]> => {
  const res = await fetch(
    `${config.api.url}/translated-verses?projectUnitId=${projectUnitId}&bookId=${bookId}&chapterNumber=${chapterNumber}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) throw new Error('Failed to fetch Target Text');

  const data = (await res.json()) as TargetText[];
  return data;
};

export const targetTextQueryOptions = (
  projectUnitId: number,
  bookId: number,
  chapterNumber: number
) =>
  queryOptions({
    queryKey: ['verse-text', { projectUnitId, bookId, chapterNumber }],
    queryFn: () => fetchTargetText(projectUnitId, bookId, chapterNumber),
    // Translations can change while another assignment is open. Reuse them briefly, and
    // invalidate immediately after this client's saves so navigation cannot hydrate old drafts.
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

const addTranslatedVerse = async (verseData: VerseData): Promise<ProjectItem> => {
  const res = await fetch(`${config.api.url}/translated-verses`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verseData),
  });
  if (!res.ok) {
    let message = 'Failed to add verse text';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Fallback if non-JSON error
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  const data = (await res.json()) as ProjectItem;
  return data;
};

const isPermissionError = (error: unknown): boolean => {
  const status = (error as { status?: number } | null | undefined)?.status;
  return status === 403 || status === 401 || status === 404;
};

export const useAddTranslatedVerse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ verseData }: { verseData: VerseData }) => addTranslatedVerse(verseData),
    onSuccess: (_data, { verseData }) => {
      void queryClient.invalidateQueries({
        queryKey: ['verse-text', { projectUnitId: verseData.projectUnitId }],
      });
    },
    onError: error => {
      if (isPermissionError(error)) {
        useAppStore.getState().setRoleChangeWarning(true);
      }
      Logger.logException(error, { context: 'Error adding translated verse' });
    },
  });
};

const submitChapter = async (chapterAssignmentId: number): Promise<ProjectItem> => {
  const res = await fetch(`${config.api.url}/chapter-assignments/${chapterAssignmentId}/submit`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(chapterAssignmentId),
  });
  if (!res.ok) {
    let message = 'Failed to submit chapter';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Fallback if non-JSON error
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  const data = (await res.json()) as ProjectItem;
  return data;
};

export const useSubmitChapter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chapterAssignmentId }: { chapterAssignmentId: number }) =>
      submitChapter(chapterAssignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chapter-submit'] });
    },
    onError: error => {
      if (isPermissionError(error)) {
        useAppStore.getState().setRoleChangeWarning(true);
      }
      Logger.logException(error, { context: 'Error submitting chapter' });
    },
  });
};
