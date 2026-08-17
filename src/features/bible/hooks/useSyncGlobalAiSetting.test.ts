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

const makeProjectItem = (overrides: Partial<ProjectItem> = {}): ProjectItem =>
  ({
    chapterAssignmentId: 100,
    projectId: 1,
    isAiEnabled: false,
    ...overrides,
  }) as ProjectItem;

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
    const projectItem = makeProjectItem({ chapterAssignmentId: 101, isAiEnabled: false });
    useAppStore.setState({
      aiAutoEnablePreferences: { [mockUser.id]: true },
    });

    let patchCalled = false;
    server.use(
      http.patch(`${config.api.url}/chapter-assignments/101/ai-status`, () => {
        patchCalled = true;
        return HttpResponse.json({});
      })
    );

    renderHook(() => useSyncGlobalAiSetting(101, 'proj1', false, false, projectItem), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });
  });

  it('AI does not auto-enable on read-only /view/...', async () => {
    const projectItem = makeProjectItem({ chapterAssignmentId: 102, isAiEnabled: false });
    useAppStore.setState({
      aiAutoEnablePreferences: { [mockUser.id]: true },
    });

    let patchCalled = false;
    server.use(
      http.patch(`${config.api.url}/chapter-assignments/102/ai-status`, () => {
        patchCalled = true;
        return HttpResponse.json({});
      })
    );

    // isReadOnly = true
    renderHook(() => useSyncGlobalAiSetting(102, 'proj1', false, true, projectItem), {
      wrapper: makeWrapper(),
    });

    // Wait a bit to ensure it doesn't fire
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(patchCalled).toBe(false);
  });

  it('Failed auto-sync does not mark the assignment as synced forever', async () => {
    const projectItem103 = makeProjectItem({ chapterAssignmentId: 103, isAiEnabled: false });
    const projectItem104 = makeProjectItem({ chapterAssignmentId: 104, isAiEnabled: false });

    useAppStore.setState({
      aiAutoEnablePreferences: { [mockUser.id]: true },
    });

    let patchCount = 0;
    server.use(
      http.patch(`${config.api.url}/chapter-assignments/:id/ai-status`, ({ params }) => {
        if (params.id === '103') {
          patchCount++;
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({});
      })
    );

    const { rerender } = renderHook(
      ({ chapterId, item }) => useSyncGlobalAiSetting(chapterId, 'proj1', false, false, item),
      {
        wrapper: makeWrapper(),
        initialProps: { chapterId: 103, item: projectItem103 },
      }
    );

    await waitFor(() => {
      expect(patchCount).toBe(1);
    });

    // Even if it failed, it shouldn't retry instantly in a loop
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(patchCount).toBe(1);

    // Navigate to another chapter, wait a tick so its mutation starts with the correct closure
    rerender({ chapterId: 104, item: projectItem104 });
    await new Promise(resolve => setTimeout(resolve, 50));

    // Navigate back to 103 — should retry
    rerender({ chapterId: 103, item: projectItem103 });

    await waitFor(() => {
      expect(patchCount).toBe(2);
    });
  });
});
