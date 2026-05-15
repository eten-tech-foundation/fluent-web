import { useMutation, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { type ProjectItem, type VerseData } from '@/lib/types';

export const fetchTargetText = async (
  projectUnitId: number,
  bookId: number,
  chapterNumber: number
): Promise<ProjectItem[]> => {
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

  const data = (await res.json()) as ProjectItem[];
  return data;
};

const addTranslatedVerse = async (verseData: VerseData): Promise<ProjectItem> => {
  const res = await fetch(`${config.api.url}/translated-verses`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verseData),
  });
  if (!res.ok) throw new Error('Failed to add verse text');
  const data = (await res.json()) as ProjectItem;
  return data;
};

export const useAddTranslatedVerse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ verseData }: { verseData: VerseData }) => addTranslatedVerse(verseData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['verse-text'] });
    },
    onError: error => {
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
  if (!res.ok) throw new Error('Failed to submit chapter');
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
      Logger.logException(error, { context: 'Error submitting chapter' });
    },
  });
};
