import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { ChapterAssignmentStatus, ROLES, type ProjectItem, type User } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { renderWithProviders as render } from '@/test/render';

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

function delayPatch() {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => (finish = resolve));
  const requests: boolean[] = [];
  server.use(
    http.patch(`${config.api.url}/chapter-assignments/101/ai-status`, async ({ request }) => {
      requests.push(((await request.json()) as { isAiEnabled: boolean }).isAiEnabled);
      return pending;
    })
  );
  return { finish, requests };
}

describe('AI translation toggle', () => {
  beforeEach(() => {
    useAppStore.setState({
      userdetail: user,
      currentProjectItem: item,
      isAiThresholdMet: true,
      isAiSyncPending: false,
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
});
