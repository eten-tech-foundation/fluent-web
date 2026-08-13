import { createElement, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSyncGlobalAiSetting } from '@/features/bible/hooks/useSyncGlobalAiSetting';
import { config } from '@/lib/config';
import type { ProjectItem, User } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { createTestQueryClient, renderHook, waitFor } from '@/test/render';

const makeWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

const mockUser: User = {
  id: 42,
  email: 'test@example.com',
  username: 'Test User',
  role: 1,
  organization: 1,
};

describe('useSyncGlobalAiSetting', () => {
  beforeEach(() => {
    useAppStore.setState({
      aiAutoEnablePreferences: {},
      userdetail: mockUser,
      currentProjectItem: null,
    });
    vi.clearAllMocks();
  });

  it('AI auto-enables on an editable translation page when user preference is true', async () => {
    // Setup store with global preference true
    useAppStore.setState({
      aiAutoEnablePreferences: { [mockUser.id]: true },
      currentProjectItem: { chapterAssignmentId: 101, isAiEnabled: false } as ProjectItem,
    });

    let patchCalled = false;
    server.use(
      http.patch(`${config.api.url}/chapter-assignments/101/ai-status`, () => {
        patchCalled = true;
        return HttpResponse.json({});
      })
    );

    renderHook(() => useSyncGlobalAiSetting(101, 'proj1', false, false), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });

    // Verify store was updated
    expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(true);
  });

  it('AI does not auto-enable on read-only /view/...', async () => {
    useAppStore.setState({
      aiAutoEnablePreferences: { [mockUser.id]: true },
      currentProjectItem: { chapterAssignmentId: 102, isAiEnabled: false } as ProjectItem,
    });

    let patchCalled = false;
    server.use(
      http.patch(`${config.api.url}/chapter-assignments/102/ai-status`, () => {
        patchCalled = true;
        return HttpResponse.json({});
      })
    );

    // isReadOnly = true
    renderHook(() => useSyncGlobalAiSetting(102, 'proj1', false, true), { wrapper: makeWrapper() });

    // Wait a bit to ensure it doesn't fire
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(patchCalled).toBe(false);
  });

  it('Failed auto-sync does not mark the assignment as synced forever', async () => {
    useAppStore.setState({
      aiAutoEnablePreferences: { [mockUser.id]: true },
      currentProjectItem: { chapterAssignmentId: 103, isAiEnabled: false } as ProjectItem,
    });

    let patchCount = 0;
    server.use(
      http.patch(`${config.api.url}/chapter-assignments/103/ai-status`, () => {
        patchCount++;
        return new HttpResponse(null, { status: 500 });
      })
    );

    const { rerender } = renderHook(
      ({ chapterId }) => useSyncGlobalAiSetting(chapterId, 'proj1', false, false),
      {
        wrapper: makeWrapper(),
        initialProps: { chapterId: 103 },
      }
    );

    await waitFor(() => {
      expect(patchCount).toBe(1);
    });

    // Even if it failed, it shouldn't retry instantly in a loop
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(patchCount).toBe(1);

    // If we navigate to another chapter, then back, it should retry the sync for 103
    rerender({ chapterId: 104 });
    rerender({ chapterId: 103 });

    await waitFor(() => {
      // It should have fired a second time because hasSyncedRef was never set for 103
      expect(patchCount).toBe(2);
    });
  });
});
