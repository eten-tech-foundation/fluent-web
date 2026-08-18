/**
 * Host-composition tests for `useSourceTtsPlayback` (§12.1 "Queue" row).
 *
 * The queue itself is exhaustively covered by `useTtsPlaybackQueue.test.ts`,
 * so it is mocked here and this file asserts only the four responsibilities
 * this hook adds: document-order start index, conditional scroll, the T16
 * boundary decision, and the failure toast.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { disarmTtsContinuation } from '../lib/playbackContinuation';
import { type TtsEngine, type TtsQueueItem } from '../tts.types';

import {
  useSourceTtsPlayback,
  type TtsNextPage,
  type UseSourceTtsPlaybackOptions,
} from './useSourceTtsPlayback';
import { type UseTtsPlaybackQueueOptions } from './useTtsPlaybackQueue';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, options?: Record<string, unknown>) =>
      defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? '')),
  }),
}));

// Captured queue wiring, so tests can fire the queue's callbacks by hand.
let queueOptions: UseTtsPlaybackQueueOptions;
const playOne = vi.fn();
const playFrom = vi.fn();
const stop = vi.fn();
let itemStates: Record<string, string> = {};
let status = 'idle';
let activeVerseRef: string | null = null;

vi.mock('./useTtsPlaybackQueue', () => ({
  useTtsPlaybackQueue: (options: UseTtsPlaybackQueueOptions) => {
    queueOptions = options;
    return { status, activeVerseRef, itemStates, playOne, playFrom, stop };
  },
}));

const engine: TtsEngine = { synthesize: vi.fn() };

// The queue stubs are module-level (the mock factory is hoisted), so they must
// be reset per test or one test's play call leaks into the next assertion.
beforeEach(() => {
  vi.clearAllMocks();
  itemStates = {};
  status = 'idle';
  activeVerseRef = null;
  // The continuation token is module state: an arm left behind by one test
  // would make the next test's page start playing on mount.
  disarmTtsContinuation();
});

/** Row 2 is a reference-panel hole, so the queue is v1, v3, v4 (§5.1). */
const rows = [
  { verseRef: 'GEN 1:1', text: 'one', langCode: 'eng' },
  { verseRef: 'GEN 1:2', text: null },
  { verseRef: 'GEN 1:3', text: 'three', langCode: 'eng' },
  { verseRef: 'GEN 1:4', text: 'four', langCode: 'eng' },
];

const rect = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom }) });

const setup = (overrides: Partial<UseSourceTtsPlaybackOptions> = {}) => {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  const options: UseSourceTtsPlaybackOptions = {
    engine,
    rows,
    // Every row sits far below the viewport unless a test says otherwise.
    getRowElement: () => ({ ...rect(900, 960), scrollIntoView, focus }),
    getViewport: () => rect(0, 500),
    ...overrides,
  };
  const { result, rerender } = renderHook(() => useSourceTtsPlayback(options));
  return { result, rerender, scrollIntoView, focus };
};

const nextPage = (navigate: Mock = vi.fn()): TtsNextPage => ({
  label: 'Genesis 2',
  pageKey: 'chapter-2',
  navigate,
});

describe('useSourceTtsPlayback — play actions', () => {
  it('plays one verse without arming the queue (T1)', () => {
    const { result } = setup();

    act(() => result.current.playVerse('GEN 1:3'));

    expect(playOne).toHaveBeenCalledWith(
      expect.objectContaining({ verseRef: 'GEN 1:3', text: 'three' })
    );
    expect(playFrom).not.toHaveBeenCalled();
  });

  it('starts play-from-here at the index in the FILTERED list, not the row position', () => {
    const { result } = setup();

    act(() => result.current.playFromVerse('GEN 1:3'));

    const [items, index] = playFrom.mock.calls.at(-1) as [TtsQueueItem[], number];
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3', 'GEN 1:4']);
    // Row 3 on screen is queue index 1 — a rendered-row count would say 2.
    expect(index).toBe(1);
  });

  it('ignores play requests for an unplayable row (§5.1)', () => {
    const { result } = setup();

    act(() => result.current.playVerse('GEN 1:2'));
    act(() => result.current.playFromVerse('GEN 1:2'));

    expect(playOne).not.toHaveBeenCalled();
    expect(playFrom).not.toHaveBeenCalled();
  });

  it('reports playability and per-row loading from the queue', () => {
    itemStates = { 'GEN 1:3': 'synthesizing' };
    const { result } = setup();

    expect(result.current.isRowPlayable('GEN 1:1')).toBe(true);
    expect(result.current.isRowPlayable('GEN 1:2')).toBe(false);
    expect(result.current.isRowLoading('GEN 1:3')).toBe(true);
    expect(result.current.isRowLoading('GEN 1:1')).toBe(false);
  });

  it('delegates stop to the queue', () => {
    const { result } = setup();

    act(() => result.current.stop());

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// G3a — pericope mode plays a bounded group and stops at its end
// ---------------------------------------------------------------------------

describe('useSourceTtsPlayback — playGroup (G3a)', () => {
  it('plays ONLY the group, in document order, and raises no boundary mid-page', () => {
    const { result } = setup();

    // Given out of order and including the unplayable row, exactly as a
    // pericope card would hand over its verses.
    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:2', 'GEN 1:1']));

    const [items, index, emitBoundary] = playFrom.mock.calls.at(-1) as [
      TtsQueueItem[],
      number,
      boolean,
    ];
    // Order comes from the page's list, not the caller's array; the hole is gone.
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3']);
    expect(index).toBe(0);
    // GEN 1:4 is still to come on this page, so "Continue on the next page?"
    // would be a lie.
    expect(emitBoundary).toBe(false);
  });

  it('DOES raise the boundary when the group ends where the page ends (T16)', () => {
    const { result } = setup();

    act(() => result.current.playGroup(['GEN 1:3', 'GEN 1:4']));

    const [items, , emitBoundary] = playFrom.mock.calls.at(-1) as [TtsQueueItem[], number, boolean];
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:3', 'GEN 1:4']);
    expect(emitBoundary).toBe(true);
  });

  it('ignores a group with nothing playable in it (§5.1)', () => {
    const { result } = setup();

    act(() => result.current.playGroup(['GEN 1:2']));

    expect(playFrom).not.toHaveBeenCalled();
    expect(playOne).not.toHaveBeenCalled();
  });

  it("playFromGroup runs to the END of the page, starting at the group's first playable row", () => {
    const { result } = setup();

    // The group opens on the reference-panel hole, so "first row" and "first
    // PLAYABLE row" are different answers.
    act(() => result.current.playFromGroup(['GEN 1:2', 'GEN 1:3']));

    const [items, index, emitBoundary] = playFrom.mock.calls.at(-1) as [
      TtsQueueItem[],
      number,
      boolean | undefined,
    ];
    // The whole page, not the group — this action is the continuous one.
    expect(items.map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3', 'GEN 1:4']);
    expect(index).toBe(1);
    // It really does end at the page end, so T16's prompt is honest here.
    expect(emitBoundary ?? true).toBe(true);
  });

  it('playFromGroup ignores a group with nothing playable in it (§5.1)', () => {
    const { result } = setup();

    act(() => result.current.playFromGroup(['GEN 1:2']));

    expect(playFrom).not.toHaveBeenCalled();
  });

  it('isGroupSpeaking follows the playing row, so both layouts light up from one source', () => {
    activeVerseRef = 'GEN 1:3';
    const { result } = setup();

    expect(result.current.isGroupSpeaking(['GEN 1:1', 'GEN 1:3'])).toBe(true);
    expect(result.current.isGroupSpeaking(['GEN 1:4'])).toBe(false);
  });

  it('isGroupSpeaking is false for every group while idle', () => {
    const { result } = setup();

    expect(result.current.isGroupSpeaking(['GEN 1:1', 'GEN 1:3'])).toBe(false);
  });
});

describe('useSourceTtsPlayback — auto-scroll (§5.3 step 2)', () => {
  it('scrolls the active row when it is off-screen, without touching focus', () => {
    const { scrollIntoView, focus } = setup();

    act(() => queueOptions.onScrollRequest?.('GEN 1:3'));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it('leaves the viewport alone when the row is already visible', () => {
    const scrollIntoView = vi.fn();
    setup({ getRowElement: () => ({ ...rect(100, 160), scrollIntoView }) });

    act(() => queueOptions.onScrollRequest?.('GEN 1:3'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('useSourceTtsPlayback — boundary prompt (T16)', () => {
  it('stays silent at the end of the page when nothing follows', () => {
    const { result } = setup();

    act(() => queueOptions.onBoundaryReached?.());

    expect(result.current.boundaryPrompt.open).toBe(false);
  });

  it('asks when the host proved a next page exists', () => {
    const { result } = setup({ nextPage: nextPage() });

    act(() => queueOptions.onBoundaryReached?.());

    expect(result.current.boundaryPrompt.open).toBe(true);
    expect(result.current.boundaryPrompt.nextPageLabel).toBe('Genesis 2');
  });

  it('declining never navigates', () => {
    const navigate = vi.fn();
    const { result } = setup({ nextPage: nextPage(navigate) });

    act(() => queueOptions.onBoundaryReached?.());
    act(() => result.current.boundaryPrompt.onDismiss());

    expect(result.current.boundaryPrompt.open).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('awaits the host navigation (which flushes saves) before closing', async () => {
    let release = () => {};
    const navigate = vi.fn(() => new Promise<void>(resolve => (release = resolve)));
    const { result } = setup({ nextPage: nextPage(navigate) });

    act(() => queueOptions.onBoundaryReached?.());
    act(() => result.current.boundaryPrompt.onContinue());

    expect(navigate).toHaveBeenCalledTimes(1);
    // Still open and locked while the flush is in flight.
    expect(result.current.boundaryPrompt.isContinuing).toBe(true);
    expect(result.current.boundaryPrompt.open).toBe(true);

    await act(async () => {
      release();
    });

    expect(result.current.boundaryPrompt.isContinuing).toBe(false);
    expect(result.current.boundaryPrompt.open).toBe(false);
  });

  it('stays put and unlocks when the navigation rejects', async () => {
    const navigate = vi.fn(() => Promise.reject(new Error('nope')));
    const { result } = setup({ nextPage: nextPage(navigate) });

    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });

    expect(result.current.boundaryPrompt.isContinuing).toBe(false);
    expect(result.current.boundaryPrompt.open).toBe(false);
  });
});

describe('useSourceTtsPlayback — continuing across the boundary (T16)', () => {
  it('resumes on the promised page, from its first playable verse', async () => {
    // Page 1 confirms the prompt...
    const { result } = setup({ nextPage: nextPage(), pageKey: 'chapter-1' });
    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });

    // ...and the next page mounts as its own host, as the route change makes it.
    setup({ pageKey: 'chapter-2' });

    expect(playFrom).toHaveBeenCalledTimes(1);
    expect(playFrom).toHaveBeenCalledWith(
      [
        expect.objectContaining({ verseRef: 'GEN 1:1' }),
        expect.objectContaining({ verseRef: 'GEN 1:3' }),
        expect.objectContaining({ verseRef: 'GEN 1:4' }),
      ],
      0
    );
  });

  it('does not play on a page that was merely visited', () => {
    setup({ pageKey: 'chapter-2' });

    expect(playFrom).not.toHaveBeenCalled();
  });

  it('does not play on a page other than the one confirmed', async () => {
    const { result } = setup({ nextPage: nextPage(), pageKey: 'chapter-1' });
    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });

    setup({ pageKey: 'chapter-9' });

    expect(playFrom).not.toHaveBeenCalled();
  });

  it('does not re-play when the promised page re-renders', async () => {
    const { result } = setup({ nextPage: nextPage(), pageKey: 'chapter-1' });
    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });

    const arrived = setup({ pageKey: 'chapter-2' });
    act(() => arrived.rerender());

    expect(playFrom).toHaveBeenCalledTimes(1);
  });

  it('does not arm anything when the prompt is declined', () => {
    const { result } = setup({ nextPage: nextPage(), pageKey: 'chapter-1' });
    act(() => queueOptions.onBoundaryReached?.());
    act(() => result.current.boundaryPrompt.onDismiss());

    setup({ pageKey: 'chapter-2' });

    expect(playFrom).not.toHaveBeenCalled();
  });

  it('withdraws the promise when the navigation rejects', async () => {
    const navigate = vi.fn(() => Promise.reject(new Error('nope')));
    const { result } = setup({ nextPage: nextPage(navigate), pageKey: 'chapter-1' });
    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });

    // Nothing moved, so the destination — reached later by hand — is silent.
    setup({ pageKey: 'chapter-2' });

    expect(playFrom).not.toHaveBeenCalled();
  });

  it('stays silent when the arriving page has no playable rows', async () => {
    const { result } = setup({ nextPage: nextPage(), pageKey: 'chapter-1' });
    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });

    setup({ pageKey: 'chapter-2', rows: [{ verseRef: 'GEN 2:1', text: null }] });

    expect(playFrom).not.toHaveBeenCalled();
  });
});

describe('useSourceTtsPlayback — leaving the page mid-playback (§5.2)', () => {
  /**
   * The drafting route swaps chapters WITHOUT unmounting (no `remountDeps`),
   * so these rerender one host with a new page key rather than mounting a
   * second one — which is the shape the live bug had.
   */
  const pageProps = (
    pageKey: string,
    overrides: Partial<UseSourceTtsPlaybackOptions> = {}
  ): UseSourceTtsPlaybackOptions => ({
    engine,
    rows,
    getRowElement: () => ({ ...rect(900, 960), scrollIntoView: vi.fn(), focus: vi.fn() }),
    getViewport: () => rect(0, 500),
    pageKey,
    ...overrides,
  });

  const renderPage = (pageKey: string, overrides: Partial<UseSourceTtsPlaybackOptions> = {}) =>
    renderHook((options: UseSourceTtsPlaybackOptions) => useSourceTtsPlayback(options), {
      initialProps: pageProps(pageKey, overrides),
    });

  it('stops the queue when the page changes underneath it', () => {
    const { rerender, result } = renderPage('chapter-2');
    act(() => result.current.playFromVerse('GEN 1:1'));
    expect(stop).not.toHaveBeenCalled();

    // Back to the previous chapter: same component, new data.
    act(() => rerender(pageProps('chapter-1')));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('keeps playing across a re-render of the same page', () => {
    const { rerender } = renderPage('chapter-2');

    act(() => rerender(pageProps('chapter-2')));

    expect(stop).not.toHaveBeenCalled();
  });

  it('keeps playing when only the rows change (panel switch)', () => {
    const { rerender } = renderPage('chapter-2');

    act(() =>
      rerender(
        pageProps('chapter-2', { rows: [{ verseRef: 'GEN 1:1', text: 'otra', langCode: 'spa' }] })
      )
    );

    expect(stop).not.toHaveBeenCalled();
  });

  it('closes a boundary prompt the listener has navigated away from', () => {
    const { rerender, result } = renderPage('chapter-2', { nextPage: nextPage() });
    act(() => queueOptions.onBoundaryReached?.());
    expect(result.current.boundaryPrompt.open).toBe(true);

    act(() => rerender(pageProps('chapter-1', { nextPage: nextPage() })));

    expect(result.current.boundaryPrompt.open).toBe(false);
  });

  it('stops the old session before starting the continued one', async () => {
    const calls: string[] = [];
    stop.mockImplementation(() => calls.push('stop'));
    playFrom.mockImplementation(() => calls.push('playFrom'));

    const { rerender, result } = renderPage('chapter-1', { nextPage: nextPage() });
    act(() => queueOptions.onBoundaryReached?.());
    await act(async () => {
      result.current.boundaryPrompt.onContinue();
    });
    calls.length = 0; // playFromVerse was never called; ignore the arming render

    act(() => rerender(pageProps('chapter-2')));

    expect(calls).toEqual(['stop', 'playFrom']);
  });
});

describe('useSourceTtsPlayback — failure surfacing (§5.2)', () => {
  it('turns a playback failure into a toast that names the verse', () => {
    setup();

    act(() => queueOptions.onError?.(new Error('boom'), { verseRef: 'GEN 1:3', text: 'three' }));

    expect(toastError).toHaveBeenCalledWith(
      'Could not play audio for verse GEN 1:3. Please try again.'
    );
  });
});
