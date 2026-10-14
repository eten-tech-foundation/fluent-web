import { type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { chapterAudioQueryKey } from '@/features/audio/hooks/useChapterAudio';
import { useResolveConflict } from '@/features/audio/hooks/useResolveConflict';
import { config } from '@/lib/config';
import { type ChapterAudioResponse, type VerseAudioRecording } from '@/lib/types';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

const mockRecording: VerseAudioRecording = {
  id: 10,
  projectUnitId: 1,
  bibleTextId: 100,
  uploadedBy: 1,
  contentType: 'audio/webm',
  sizeBytes: 1234,
  durationSeconds: 5,
  versionToken: 2,
  conflictStatus: 'conflict',
  activeTakeId: 20,
  verseNumber: 1,
  downloadUrl: 'https://example.com/audio/20',
  takes: [
    {
      id: 20,
      uploadedBy: 1,
      contentType: 'audio/webm',
      sizeBytes: 1234,
      durationSeconds: 5,
      contentHash: 'hash1',
      downloadUrl: 'https://example.com/audio/20',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 21,
      uploadedBy: 2,
      contentType: 'audio/webm',
      sizeBytes: 1234,
      durationSeconds: 5,
      contentHash: 'hash2',
      downloadUrl: 'https://example.com/audio/21',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const resolvedRecording: VerseAudioRecording = {
  ...mockRecording,
  conflictStatus: 'resolved',
  activeTakeId: 21,
};

describe('useResolveConflict', () => {
  it('resolves conflict, patches chapterAudio cache, and invalidates chapterAudio and chapterAssignments queries', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${config.api.url}/verse-audio/1/100/resolve`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(resolvedRecording);
      })
    );

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const cacheKey = {
      projectUnitId: 1,
      bibleId: 2,
      bookId: 3,
      chapterNumber: 4,
    };
    const chapterAudioKey = chapterAudioQueryKey(cacheKey);

    queryClient.setQueryData<ChapterAudioResponse>(chapterAudioKey, {
      items: [mockRecording],
      hasConflict: true,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useResolveConflict(), { wrapper });

    await result.current.mutateAsync({
      key: cacheKey,
      bibleTextId: 100,
      takeId: 21,
    });

    expect(capturedBody).toEqual({ takeId: 21 });

    // Cache should be updated in-place with resolved conflict
    const cachedData = queryClient.getQueryData<ChapterAudioResponse>(chapterAudioKey);
    expect(cachedData).toEqual({
      items: [resolvedRecording],
      hasConflict: false,
    });

    // Invalidation should be triggered for chapterAudio
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chapterAudioKey });

    // Invalidation should be triggered for chapterAssignments
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chapterAssignments'] });
  });

  it('surfaces the API error message when resolution fails', async () => {
    server.use(
      http.post(`${config.api.url}/verse-audio/1/100/resolve`, () =>
        HttpResponse.json({ message: 'Conflict already resolved' }, { status: 409 })
      )
    );

    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useResolveConflict(), { wrapper });

    await expect(
      result.current.mutateAsync({
        key: {
          projectUnitId: 1,
          bibleId: 2,
          bookId: 3,
          chapterNumber: 4,
        },
        bibleTextId: 100,
        takeId: 21,
      })
    ).rejects.toThrow('Conflict already resolved');
  });
});
