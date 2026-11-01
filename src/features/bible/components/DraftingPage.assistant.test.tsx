import { useLayoutEffect, useState } from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssistantConversation } from '@/features/assistant/assistant.conversation';
import type { TurnUpdate, streamAssistantTurn } from '@/features/assistant/assistant.turn.client';
import { useAssistantConversation } from '@/features/assistant/components/AssistantConversationProvider';
import type { DraftingUIProps, ProjectItem, User } from '@/lib/types';
import { useAppStore } from '@/store/store';

import DraftingPage from './DraftingPage';

const test = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  ready: true,
  canonicalVerse: 30,
  owner: null as AssistantConversation | null,
  deliveries: [] as Array<{
    publish: (update: TurnUpdate) => void;
    signal: AbortSignal;
    reject: (error: unknown) => void;
  }>,
}));
vi.mock('@tanstack/react-router', () => ({
  useMatch: ({ from }: { from: string }) => (from.includes('/translation/') ? test : undefined),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/hooks/useRefreshUserDetail', () => ({
  useRefreshUserDetail: () => ({ refresh: () => {} }),
}));
vi.mock('@/features/bible/hooks/useSyncGlobalAiSetting', () => ({
  useSyncGlobalAiSetting: vi.fn(),
}));
vi.mock('@/features/tts', () => ({
  usePlaybackRegistry: () => ({ setPageKey: () => {}, endPage: () => {} }),
}));
vi.mock('@/features/assistant/assistant.turn.client', () => ({
  streamAssistantTurn: vi.fn<typeof streamAssistantTurn>(
    (_project, _request, publish, signal) =>
      new Promise((_resolve, reject) => test.deliveries.push({ publish, signal, reject }))
  ),
}));
vi.mock('./DraftingUI', () => ({
  DraftingUI: ({ projectItem }: DraftingUIProps) => {
    const { owner, state } = useAssistantConversation();
    const [visible, setVisible] = useState(true);
    test.owner = owner;
    useLayoutEffect(() => {
      owner.navigate({
        context: {
          projectId: projectItem.projectId,
          bookCode: 'JHN',
          chapter: 3,
          activeVerse: test.canonicalVerse,
        },
        ready: test.ready,
        passageChapters: [3, 4],
        intent: `${projectItem.projectId}:${projectItem.chapterAssignmentId}`,
      });
    }, [owner, projectItem]);
    return (
      <>
        <button onClick={() => setVisible(!visible)}>Toggle panel</button>
        {visible && (
          <output>
            {state.turns.at(-1)?.attempts.at(-1)?.prefix?.markdown ?? 'empty'}|{state.draft}
          </output>
        )}
      </>
    );
  },
}));
const project = (chapter: number, projectId = 1) =>
  ({
    chapterAssignmentId: chapter,
    projectId,
    bookCode: 'JHN',
    chapterNumber: chapter,
  }) as ProjectItem;
const loaded = (projectItem: ProjectItem) => ({ projectItem, sourceVerses: [], targetVerses: [] });
function open() {
  test.ready = true;
  test.canonicalVerse = 30;
  test.deliveries = [];
  useAppStore.setState({
    userdetail: { id: 1, role: 'Project Translator', grants: [] } as unknown as User,
    currentProjectItem: null,
  });
  test.loaderData = loaded(project(3));
  const view = render(<DraftingPage />);
  act(() => {
    test.owner!.configure('en');
    test.owner!.observeBriefing(
      {
        source: 'Briefing',
        phase: 'complete',
        outputLanguage: 'en',
        metadata: null,
        cacheHit: false,
        integrity: {
          contextReceipt: 'context',
          operationId: 'briefing',
          prefix: { markdown: 'Briefing', sequence: 1, complete: true, receipt: 'receipt' },
        },
      },
      test.owner!.getSnapshot().generation
    );
    test.owner!.submit('Question', 'typed');
    test.owner!.setDraft('draft');
  });
  return view;
}
function finish(markdown: string) {
  act(() =>
    test.deliveries[0].publish({
      type: 'prefix',
      operationId: 'operation',
      prefix: { markdown, sequence: 1, complete: true, receipt: 'receipt' },
    })
  );
}
afterEach(cleanup);
describe('real drafting page conversation ownership', () => {
  it('continues while panel unmounted and survives loader + keyed chapter remount in same cross-chapter passage', () => {
    const view = open();
    const owner = test.owner;
    fireEvent.click(screen.getByText('Toggle panel'));
    expect(screen.queryByRole('status')).toBeNull();
    finish('Completed hidden');
    fireEvent.click(screen.getByText('Toggle panel'));
    expect(screen.getByText('Completed hidden|draft')).toBeInTheDocument();
    act(() => {
      useAppStore.setState({ currentProjectItem: project(4) });
    });
    expect(test.owner).toBe(owner);
    expect(owner!.getSnapshot().ready).toBe(false);
    expect(owner!.getSnapshot().turns).toHaveLength(1);
    test.loaderData = loaded(project(4));
    view.rerender(<DraftingPage />);
    expect(test.owner).toBe(owner);
    expect(owner!.getSnapshot().ready).toBe(true);
    expect(screen.getByText('Completed hidden|draft')).toBeInTheDocument();
    expect(test.deliveries).toHaveLength(1);
    expect(test.deliveries[0].signal.aborted).toBe(false);
  });
  it('returns to the same streaming turn and preserves a genuine failure while hidden', async () => {
    open();
    fireEvent.click(screen.getByText('Toggle panel'));
    act(() =>
      test.deliveries[0].publish({
        type: 'prefix',
        operationId: 'operation',
        prefix: { markdown: 'Partial', sequence: 1, complete: false, receipt: 'receipt' },
      })
    );
    fireEvent.click(screen.getByText('Toggle panel'));
    expect(screen.getByText('Partial|draft')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toggle panel'));
    await act(async () => {
      test.deliveries[0].reject(new Error('network'));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText('Toggle panel'));
    expect(screen.getByText('Partial|draft')).toBeInTheDocument();
    expect(test.owner!.getSnapshot().turns[0].attempts[0].state).toBe('failed');
    expect(test.deliveries).toHaveLength(1);
  });
  it('clears project intent before new loader and discards on workspace exit', () => {
    const view = open();
    act(() => {
      useAppStore.setState({ currentProjectItem: project(4, 2) });
    });
    expect(test.owner!.getSnapshot()).toMatchObject({ turns: [], draft: '', ready: false });
    expect(test.deliveries[0].signal.aborted).toBe(true);
    finish('stale');
    expect(test.owner!.getSnapshot().turns).toHaveLength(0);
    view.unmount();
    expect(test.owner!.getSnapshot().context).toBeNull();
  });
  it('clears hidden passage changes and does not restore an old A passage', () => {
    const view = open();
    fireEvent.click(screen.getByText('Toggle panel'));
    test.canonicalVerse = 40;
    test.loaderData = loaded(project(3));
    view.rerender(<DraftingPage />);
    test.canonicalVerse = 30;
    test.loaderData = loaded(project(3));
    view.rerender(<DraftingPage />);
    finish('old completion');
    fireEvent.click(screen.getByText('Toggle panel'));
    expect(screen.getByText('empty|')).toBeInTheDocument();
    expect(test.deliveries).toHaveLength(1);
  });
  it('fences known different chapter even when its unresolved bridge mounts before the parent intent effect', () => {
    const view = open();
    test.ready = false;
    test.loaderData = loaded(project(5));
    act(() => {
      useAppStore.setState({ currentProjectItem: project(5) });
      view.rerender(<DraftingPage />);
    });
    expect(test.owner!.getSnapshot()).toMatchObject({ turns: [], draft: '', ready: false });
    expect(test.deliveries[0].signal.aborted).toBe(true);
  });
  it('fences a known different chapter at intent before canonical loader completion', () => {
    open();
    act(() => {
      useAppStore.setState({ currentProjectItem: project(5) });
    });
    expect(test.owner!.getSnapshot()).toMatchObject({ turns: [], draft: '', ready: false });
    expect(test.deliveries[0].signal.aborted).toBe(true);
  });
  it('discards on authentication loss even while workspace loader is shown', () => {
    open();
    act(() => {
      useAppStore.setState({ userdetail: null });
    });
    expect(test.owner!.getSnapshot()).toMatchObject({ turns: [], draft: '', ready: false });
    expect(test.deliveries[0].signal.aborted).toBe(true);
  });
});
