import { createElement, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSyncGlobalAiSetting } from '@/features/bible/hooks/useSyncGlobalAiSetting';
import { config } from '@/lib/config';
import { ChapterAssignmentStatus, ROLES, type ProjectItem, type User } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { createTestQueryClient, renderHook, renderWithProviders as render } from '@/test/render';

import { AiTranslationSettings } from './AiTranslationSettings';

import type * as Router from '@tanstack/react-router';

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof Router>()),
  useLocation: () => ({ pathname: '/translation/1/1' }),
  useSearch: () => ({}),
}));

const item = {
  chapterAssignmentId: 101,
  projectId: 1,
  chapterStatus: ChapterAssignmentStatus.DRAFT,
  isAiEnabled: false,
} as ProjectItem;
const user = { id: 42, role: ROLES.PROJECT_TRANSLATOR } as User;

function delayPatch(assignmentId = 101) {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => (finish = resolve));
  const requests: boolean[] = [];
  server.use(
    http.patch(
      `${config.api.url}/chapter-assignments/${assignmentId}/ai-status`,
      async ({ request }) => {
        requests.push(((await request.json()) as { isAiEnabled: boolean }).isAiEnabled);
        return pending;
      }
    )
  );
  return { finish, requests };
}

describe('AI translation toggle', () => {
  beforeEach(() => {
    useAppStore.setState({
      userdetail: user,
      currentProjectItem: item,
      isAiThresholdMet: true,
      aiSyncPendingCount: 0,
      manualAiEnable: null,
      aiAutoEnablePreferences: { 42: false },
    });
  });

  it('waits for server opt-in before the drafting surface can request suggestions', async () => {
    const { finish, requests } = delayPatch();
    render(<AiTranslationSettings />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(requests).toEqual([true]));
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(false);
    expect(useAppStore.getState().aiAutoEnablePreferences[42]).toBe(false);
    await act(async () => finish(HttpResponse.json({ message: 'Updated successfully' })));
    await waitFor(() => expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(true));
    expect(useAppStore.getState().aiAutoEnablePreferences[42]).toBe(true);
    expect(useAppStore.getState().manualAiEnable).toEqual({ assignmentId: 101, revision: 1 });
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('stops loading on opt-out immediately and keeps it disabled after Settings closes', async () => {
    useAppStore.setState({ currentProjectItem: { ...item, isAiEnabled: true } });
    const { finish, requests } = delayPatch();
    const view = render(<AiTranslationSettings />);
    fireEvent.click(screen.getByRole('switch'));
    expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(false);
    await waitFor(() => expect(requests).toEqual([false]));
    view.unmount();
    await act(async () => finish(HttpResponse.json({})));
    expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(false);
  });

  it('finishes opt-in even if Settings closes before the response', async () => {
    const { finish, requests } = delayPatch();
    const view = render(<AiTranslationSettings />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(requests).toHaveLength(1));
    view.unmount();
    render(<AiTranslationSettings />);
    expect(screen.getByRole('switch')).toBeDisabled();
    await act(async () => finish(HttpResponse.json({})));
    await waitFor(() => expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(true));
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('restores a failed opt-out after Settings closes without losing newer project fields', async () => {
    useAppStore.setState({
      currentProjectItem: { ...item, isAiEnabled: true },
      aiAutoEnablePreferences: { 42: true },
    });
    const { finish, requests } = delayPatch();
    const view = render(<AiTranslationSettings />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(requests).toHaveLength(1));
    view.unmount();
    useAppStore.setState({ currentProjectItem: { ...item, chapterNumber: 7 } });
    await act(async () => finish(new HttpResponse(null, { status: 500 })));
    await waitFor(() => expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(true));
    expect(useAppStore.getState().currentProjectItem?.chapterNumber).toBe(7);
    expect(useAppStore.getState().aiAutoEnablePreferences[42]).toBe(true);
    expect(useAppStore.getState().manualAiEnable).toBeNull();
  });

  it('does not restore the previous assignment when a failed request settles after navigation', async () => {
    useAppStore.setState({ currentProjectItem: { ...item, isAiEnabled: true } });
    const { finish, requests } = delayPatch();
    render(<AiTranslationSettings />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(requests).toHaveLength(1));
    const next = { ...item, chapterAssignmentId: 102, isAiEnabled: false };
    act(() => useAppStore.setState({ currentProjectItem: next }));
    await act(async () => finish(new HttpResponse(null, { status: 500 })));
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled());
    expect(useAppStore.getState().currentProjectItem).toEqual(next);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it.each(['manual', 'automatic'] as const)(
    'keeps reopened Settings disabled when the %s update settles before the other assignment',
    async first => {
      useAppStore.setState({ aiAutoEnablePreferences: { 42: true } });
      const manual = delayPatch();
      const automatic = delayPatch(102);
      let view = render(<AiTranslationSettings />);
      fireEvent.click(screen.getByRole('switch'));
      await waitFor(() => expect(manual.requests).toEqual([true]));
      view.unmount();

      const next = { ...item, chapterAssignmentId: 102 };
      act(() => useAppStore.setState({ currentProjectItem: next }));
      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
      const sync = renderHook(() => useSyncGlobalAiSetting(102, 1, false, false, next), {
        wrapper,
      });
      await waitFor(() => expect(automatic.requests).toEqual([true]));
      view = render(<AiTranslationSettings />);
      expect(screen.getByRole('switch')).toBeDisabled();

      await act(async () => {
        (first === 'manual' ? manual : automatic).finish(HttpResponse.json({}));
      });
      await waitFor(() => {
        if (first === 'manual')
          expect(useAppStore.getState().aiAutoEnablePreferences[42]).toBe(true);
        else expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(true);
      });
      // The remount has no local mutation state: the shared pending state must hold the switch.
      view.unmount();
      view = render(<AiTranslationSettings />);
      expect(screen.getByRole('switch')).toBeDisabled();
      expect(useAppStore.getState().manualAiEnable).toBeNull();

      await act(async () => {
        (first === 'manual' ? automatic : manual).finish(HttpResponse.json({}));
      });
      await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled());
      expect(useAppStore.getState().currentProjectItem?.chapterAssignmentId).toBe(102);
      expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(true);
      expect(useAppStore.getState().manualAiEnable).toBeNull();
      sync.unmount();
    }
  );

  it('does not apply a manual toggle after the signed-in user changes', async () => {
    const pending = delayPatch();
    render(<AiTranslationSettings />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(pending.requests).toEqual([true]));
    act(() => useAppStore.setState({ userdetail: { ...user, id: 43 } }));
    await act(async () => pending.finish(HttpResponse.json({})));
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled());
    expect(useAppStore.getState().currentProjectItem?.isAiEnabled).toBe(false);
    expect(useAppStore.getState().manualAiEnable).toBeNull();
    expect(useAppStore.getState().aiAutoEnablePreferences).toEqual({ 42: false });
  });
});
