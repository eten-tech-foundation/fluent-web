import { useLayoutEffect } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantBriefingError, type PassageBriefingData } from '../assistant.types';
import fixture from '../fixtures/turn-v1.json';

import {
  AssistantConversationProvider,
  useAssistantConversation,
} from './AssistantConversationProvider';
import { AssistantConversationView } from './AssistantConversationView';
import { AssistantMarkdown } from './AssistantMarkdown';

import type { AssistantConversation } from '../assistant.conversation';
import type { streamAssistantTurn, TurnUpdate } from '../assistant.turn.client';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, text: string) => text }),
}));
const test = vi.hoisted(() => ({
  owner: null as AssistantConversation | null,
  deliveries: [] as Array<{
    publish: (update: TurnUpdate) => void;
    reject: (error: unknown) => void;
    signal: AbortSignal;
  }>,
}));
vi.mock('../assistant.turn.client', () => ({
  streamAssistantTurn: vi.fn<typeof streamAssistantTurn>(
    (_project, _request, publish, signal) =>
      new Promise<void>((_resolve, reject) => {
        test.deliveries.push({ publish, reject, signal });
      })
  ),
}));
const briefing: PassageBriefingData = {
  source: 'Briefing\n\n{{fluent:v1:suggested_question|  Suggested question?  }}',
  phase: 'complete',
  metadata: null,
  outputLanguage: 'en',
  cacheHit: false,
  integrity: {
    contextReceipt: fixture.request.contextReceipt,
    operationId: 'briefing',
    prefix: fixture.request.briefing,
  },
};
function Harness({ complete }: { complete: boolean }) {
  const { owner } = useAssistantConversation();
  test.owner = owner;
  useLayoutEffect(() => {
    owner.navigate({
      context: { projectId: 1, bookCode: 'JHN', chapter: 1, activeVerse: 1 },
      ready: true,
      intent: 'chapter',
    });
    owner.configure('en');
    owner.observeBriefing(
      { ...briefing, phase: complete ? 'complete' : 'streaming' },
      owner.getSnapshot().generation
    );
  }, [owner, complete]);
  return (
    <AssistantConversationView enabled>
      {(submit, enabled) => (
        <AssistantMarkdown
          outputContractVersion='fluent-widgets-v1'
          source={briefing.source}
          onSuggestedQuestion={enabled ? submit : undefined}
        />
      )}
    </AssistantConversationView>
  );
}
function mount(complete = true) {
  return render(
    <AssistantConversationProvider actorId={1} intent='chapter' projectId={1}>
      <Harness complete={complete} />
    </AssistantConversationProvider>
  );
}
const input = () => screen.getByRole('textbox');
function write(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}
function enter(options = {}) {
  fireEvent.keyDown(input(), { key: 'Enter', ...options });
}
function delta(index: number, markdown: string, complete = false) {
  act(() =>
    test.deliveries[index].publish({
      type: 'prefix',
      operationId: 'operation',
      prefix: { markdown, sequence: 1, complete, receipt: 'receipt' },
    })
  );
}
beforeEach(() => {
  test.deliveries = [];
  vi.clearAllMocks();
});
describe('conversation controls with the real workspace owner', () => {
  it('submits exact text once on Enter, clears only admitted draft, and supports Send', () => {
    mount();
    expect(input()).toHaveAttribute('placeholder', 'Ask a question about this passage...');
    write('  Exact question?\n ');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    fireEvent(input(), event);
    fireEvent(input(), event);
    expect(test.owner!.getSnapshot().turns.map(turn => turn.input.text)).toEqual([
      '  Exact question?\n ',
    ]);
    expect(input()).toHaveValue('');
    write('Second');
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(test.owner!.getSnapshot().turns).toHaveLength(2);
    expect(test.deliveries[0].signal.aborted).toBe(true);
  });
  it('ignores IME Enter, composition sessions, repeated Enter and Shift+Enter', () => {
    mount();
    write('Question');
    enter({ isComposing: true });
    fireEvent.compositionStart(input());
    enter();
    fireEvent.compositionEnd(input());
    enter({ keyCode: 229 });
    enter({ repeat: true });
    enter({ shiftKey: true });
    expect(test.deliveries).toHaveLength(0);
    enter();
    expect(test.deliveries).toHaveLength(1);
  });
  it('rejects blank and over-limit input without clearing it or interrupting the current answer', () => {
    mount();
    write('First');
    enter();
    write(' \n ');
    enter();
    expect(test.deliveries).toHaveLength(1);
    expect(input()).toHaveValue(' \n ');
    write('x'.repeat(4001));
    enter();
    expect(screen.getByRole('alert')).toHaveTextContent('too long');
    expect(input()).toHaveValue('x'.repeat(4001));
    expect(test.deliveries[0].signal.aborted).toBe(false);
  });
  it('keeps a draft editable while waiting, then enables it after an early suggested click', () => {
    mount(false);
    write('Unsent draft');
    enter();
    expect(test.deliveries).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Suggested question?' }));
    expect(test.owner!.getSnapshot().turns[0].input.text).toBe('  Suggested question?  ');
    expect(input()).toHaveValue('Unsent draft');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeEnabled();
    enter();
    expect(test.deliveries).toHaveLength(2);
  });
  it('shows partial output, retains old failure context, and retries only the newest question without duplicating it', async () => {
    mount();
    write('First question');
    enter();
    delta(0, 'Partial first answer');
    await act(async () =>
      test.deliveries[0].reject(new AssistantBriefingError('network_error', true))
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    write('Second question');
    enter();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByText('Partial first answer')).toBeVisible();
    expect(screen.getByText('The connection was interrupted.')).toBeVisible();
    await act(async () => test.deliveries[1].reject(new AssistantBriefingError('timed_out', true)));
    const turnId = test.owner!.getSnapshot().turns[1].turnId;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getAllByText('Second question')).toHaveLength(1);
    expect(test.owner!.getSnapshot().turns[1].turnId).toBe(turnId);
    expect(test.owner!.getSnapshot().turns[1].attempts).toHaveLength(2);
    delta(2, 'Complete answer', true);
    expect(screen.getByText('Complete answer')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Answer ready.');
  });
  it('interrupts visible output on deliberate input and fences late output without stealing composer focus', () => {
    mount();
    input().focus();
    write('First');
    enter();
    delta(0, 'Frozen prefix');
    write('Next');
    enter();
    delta(0, 'Stale final', true);
    delta(1, 'Current answer');
    expect(screen.getByText('Frozen prefix')).toBeVisible();
    expect(screen.queryByText('Stale final')).toBeNull();
    expect(screen.getByText('This answer was interrupted by a new question.')).toBeVisible();
    expect(input()).toHaveFocus();
  });
  it('keeps a reader’s scroll position for deltas, follows bottom, and brings a new submission into view', () => {
    mount();
    write('First');
    enter();
    const region = screen.getByRole('region', { name: 'Passage conversation' });
    Object.defineProperties(region, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { value: 200 },
    });
    region.scrollTop = 100;
    fireEvent.scroll(region);
    delta(0, 'First delta');
    expect(region.scrollTop).toBe(100);
    region.scrollTop = 800;
    fireEvent.scroll(region);
    Object.defineProperty(region, 'scrollHeight', { value: 1100 });
    delta(0, 'Second delta');
    expect(region.scrollTop).toBe(1100);
    region.scrollTop = 100;
    fireEvent.scroll(region);
    write('Next');
    enter();
    expect(region.scrollTop).toBe(1100);
  });
  it('restores a context-changed question and renders safe omission and nonretryable failure notices', async () => {
    mount();
    write('Pending question');
    enter();
    act(() =>
      test.deliveries[0].publish({
        type: 'turn_started',
        protocol: 'fluent-turn-v1',
        operationId: 'op',
        contextReceipt: 'context',
        turnId: 'turn',
        attemptId: 'attempt',
        projection: { omittedTurnIds: ['older'], emptyTurnIds: [], historyWindow: 1 },
      })
    );
    expect(screen.getByText(/Some older exchanges/)).toBeVisible();
    act(() => test.deliveries[0].publish({ type: 'context_changed', protocol: 'fluent-turn-v1' }));
    expect(input()).toHaveValue('Pending question');
    expect(screen.getByText(/The passage context changed/)).toBeVisible();
    act(() => test.owner!.observeBriefing(briefing, test.owner!.getSnapshot().generation));
    enter();
    await act(async () =>
      test.deliveries[1].reject(new AssistantBriefingError('context_too_large', false))
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByText(/conversation is too long/)).toBeVisible();
  });
});
