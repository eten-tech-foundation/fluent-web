/** Real host/queue/registry/controls; only synthesis and the browser media boundary are fake. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSourceTtsPlayback } from '../hooks/useSourceTtsPlayback';
import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';
import { FakeClipElement } from '../testing/fakeClipElement';
import { type TtsClip, type TtsEngine } from '../tts.types';

import { SourceVerseControl } from './SourceVerseControl';
import { PericopePlayer } from './TtsGroupControls';

import type * as audioElementModule from '../lib/audioElement';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, text: string, args?: Record<string, string>) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => args?.[key] ?? ''),
  }),
}));
const elements: FakeClipElement[] = [];
vi.mock('../lib/audioElement', async importOriginal => ({
  ...(await importOriginal<typeof audioElementModule>()),
  createClipAudioElement: (src: string) => {
    const element = new FakeClipElement();
    element.src = src;
    elements.push(element);
    return element;
  },
}));

const click = async (element: HTMLElement) => {
  fireEvent.click(element);
  await act(async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve();
  });
};

type Mode = 'verse' | 'pericope';
const rows = [1, 2, 3].map(number => ({
  verseRef: String(number),
  verseNumber: number,
  text: `Text for verse ${number}`,
  langCode: 'eng',
}));
const groups = [rows.slice(0, 2), rows.slice(2)].map(group => group.map(row => row.verseRef));
const firstLabel = (mode: Mode) => (mode === 'verse' ? 'verse 1' : 'pericope A');

function Harness({ mode, engine }: { mode: Mode; engine: TtsEngine }) {
  const playback = useSourceTtsPlayback({
    engine,
    rows,
    sourceChapter: {
      projectId: 1,
      bibleId: 2,
      bookCode: 'JHN',
      chapter: 3,
      languageCode: 'eng',
      role: 'referenceBible',
      textBibleKey: 'aq-20',
    },
    sourceLicence: { status: 'allowed' },
    referenceBibleId: 'aq-test',
    pageKey: 'controls-test',
    getRowElement: () => null,
    getViewport: () => null,
  });
  return (
    <>
      {/* Test driver for the host's run API; not a proposed on-screen control. */}
      <button
        onClick={() =>
          mode === 'verse' ? playback.playFromVerse('1') : playback.playFromGroup(groups[0])
        }
      >
        Start run
      </button>
      <output data-testid='prefetch-state'>{String(playback.isRowLoading('2'))}</output>
      {mode === 'verse'
        ? rows.map(row => (
            <SourceVerseControl key={row.verseRef} playback={playback} verseRef={row.verseRef} />
          ))
        : groups.map((refs, index) => (
            <PericopePlayer
              key={index}
              groupLabel={index === 0 ? 'A' : 'B'}
              playback={playback}
              verseRefs={refs}
            />
          ))}
    </>
  );
}

function setup(mode: Mode) {
  const pending: Array<{
    signal?: AbortSignal;
    resolve: (clip: TtsClip) => void;
    reject: (error: Error) => void;
  }> = [];
  const synthesize = vi.fn<TtsEngine['synthesize']>(
    (_request, signal) =>
      new Promise((resolve, reject) => pending.push({ signal, resolve, reject }))
  );
  render(<Harness engine={{ synthesize }} mode={mode} />, { wrapper: PlaybackRegistryProvider });
  const primary = (action = 'Play', label = firstLabel(mode)) =>
    screen.getByRole('button', { name: `${action} ${label}` });
  const resolve = async (index: number) => {
    await act(async () => pending[index].resolve({ audioUrl: `https://media.test/${index}` }));
    return elements.at(-1)!;
  };
  const playing = async (element: FakeClipElement) => {
    await act(async () => element.emit('playing'));
  };
  return { pending, synthesize, primary, resolve, playing };
}

beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  toastError.mockClear();
  elements.length = 0;
});
afterEach(() => vi.restoreAllMocks());

const expectSpinners = (count: number) => {
  expect(document.querySelectorAll('button[aria-busy="true"]')).toHaveLength(count);
  expect(document.querySelectorAll('.animate-spin')).toHaveLength(count);
};

it('a verse-key run lights pericope players in turn; cross-pericope prefetch never spins the next player', async () => {
  const h = setup('pericope');
  await click(screen.getByRole('button', { name: 'Start run' }));
  const first = await h.resolve(0);
  await h.playing(first);
  const second = await h.resolve(1);
  await act(async () => first.emit('ended'));
  await h.playing(second);
  expect(h.synthesize).toHaveBeenCalledTimes(3);
  expect(h.synthesize.mock.calls[2][0].text).toBe(rows[2].text);
  expectSpinners(0);
  expect(h.primary('Pause')).toHaveAttribute('aria-busy', 'false');
  expect(h.primary('Play', 'pericope B')).toHaveAttribute('aria-busy', 'false');
  await act(async () => second.emit('ended'));
  expect(h.primary()).toHaveAttribute('aria-busy', 'false');
  expect(h.primary('Pause', 'pericope B')).toHaveAttribute('aria-busy', 'true');
  expectSpinners(1);
  const third = await h.resolve(2);
  await h.playing(third);
  expectSpinners(0);
});

for (const mode of ['verse', 'pericope'] as const) {
  describe(`${mode} controls with real playback wiring`, () => {
    it('does not generate on mount; only the first pressed owner spins and can cancel its request', async () => {
      const h = setup(mode);
      expect(h.synthesize).not.toHaveBeenCalled();
      expectSpinners(0);
      await click(h.primary());
      expect(h.synthesize).toHaveBeenCalledTimes(1);
      expect(h.primary('Pause')).toHaveAttribute('aria-busy', 'true');
      expectSpinners(1);
      // Loading is still a cancelable primary action, not a disabled control.
      await click(h.primary('Pause'));
      expect(h.pending[0].signal?.aborted).toBe(true);
      expectSpinners(0);
      expect(h.primary()).not.toHaveAttribute('aria-disabled');
      await h.resolve(0); // A late completion must not resurrect canceled playback.
      expect(elements).toHaveLength(0);
      expectSpinners(0);
    });

    it('prefetches N+1 without spinning any control while N plays; waiting at its boundary spins only its owner', async () => {
      const h = setup(mode);
      await click(
        mode === 'verse' ? screen.getByRole('button', { name: 'Start run' }) : h.primary()
      );
      const first = await h.resolve(0);
      await h.playing(first);
      expect(h.synthesize).toHaveBeenCalledTimes(2);
      expect(h.synthesize.mock.calls[1][0].text).toBe(rows[1].text);
      expect(screen.getByTestId('prefetch-state')).toHaveTextContent('true');
      expectSpinners(0);
      expect(h.primary('Pause')).toHaveAttribute('aria-busy', 'false');
      if (mode === 'verse')
        expect(h.primary('Play', 'verse 2')).toHaveAttribute('aria-busy', 'false');
      await act(async () => first.emit('ended'));
      const nextLabel = mode === 'verse' ? 'verse 2' : firstLabel(mode);
      expect(h.primary('Pause', nextLabel)).toHaveAttribute('aria-busy', 'true');
      expectSpinners(1);
      const second = await h.resolve(1);
      await h.playing(second);
      expectSpinners(0);
      expect(h.primary('Pause', nextLabel)).toHaveAttribute('aria-busy', 'false');
    });

    it('a completed background prefetch neither spins its sibling nor starts it early', async () => {
      const h = setup(mode);
      await click(
        mode === 'verse' ? screen.getByRole('button', { name: 'Start run' }) : h.primary()
      );
      const first = await h.resolve(0);
      await h.playing(first);
      const prefetched = await h.resolve(1);
      expectSpinners(0);
      expect(prefetched.playCalls).toHaveLength(0);
      expect(first.paused).toBe(false);
      await act(async () => first.emit('ended'));
      await h.playing(prefetched);
      expect(prefetched.playCalls).toHaveLength(1);
      expectSpinners(0);
    });

    it('a failed request reports itself but never latches offline or prevents a new press', async () => {
      const h = setup(mode);
      await click(h.primary());
      await act(async () => h.pending[0].reject(new TypeError('Network request failed')));
      expect(toastError).toHaveBeenCalledWith(
        'Could not play audio for verse 1. Please try again.'
      );
      expectSpinners(0);
      expect(h.primary()).not.toHaveAttribute('aria-disabled');
      expect(h.primary()).toBeVisible();
      await click(h.primary());
      expect(h.synthesize).toHaveBeenCalledTimes(2);
      expectSpinners(1);
    });

    it.each(['loading', 'playing'] as const)(
      'browser offline overrides %s, then reconnect restores the same live state without another request',
      async state => {
        const h = setup(mode);
        await click(h.primary());
        if (state === 'playing') {
          const first = await h.resolve(0);
          await h.playing(first);
        }
        const calls = h.synthesize.mock.calls.length;
        const primary = h.primary('Pause');
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        fireEvent(window, new Event('offline'));
        expect(h.primary()).toBe(primary);
        expect(primary).toHaveAttribute('aria-disabled', 'true');
        expectSpinners(0);
        await click(primary);
        expect(toastError).toHaveBeenCalledWith("You're offline. Reconnect to play audio.");
        expect(h.pending[0].signal?.aborted).toBe(false);
        expect(h.synthesize).toHaveBeenCalledTimes(calls);
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        fireEvent(window, new Event('online'));
        expect(h.primary('Pause')).toBe(primary);
        expect(primary).not.toHaveAttribute('aria-disabled');
        expectSpinners(state === 'loading' ? 1 : 0);
        expect(h.synthesize).toHaveBeenCalledTimes(calls);
        // Reconnection restores the existing cancel/pause action, not a second run.
        await click(primary);
        expect(h.pending[0].signal?.aborted).toBe(true);
        expectSpinners(0);
      }
    );

    it('offline preserves controls, explains on press/focus, blocks actions, and reconnect restores a paused owner without autoplay', async () => {
      const h = setup(mode);
      await click(h.primary());
      const first = await h.resolve(0);
      await h.playing(first);
      first.currentTime = 2;
      await click(h.primary('Pause'));
      const primary = h.primary();
      const restart = screen.getByRole('button', { name: `Restart ${firstLabel(mode)}` });
      expect(restart).toBeEnabled();
      const calls = h.synthesize.mock.calls.length;
      const controls = screen.getAllByTestId(
        `tts-${mode === 'verse' ? 'verse' : 'group'}-controls`
      );
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      fireEvent(window, new Event('offline'));
      for (const control of controls) {
        const buttons = within(control).getAllByRole('button');
        expect(buttons[0]).toHaveAttribute('aria-disabled', 'true');
        expect(buttons[0]).toBeVisible();
        expect(buttons[1]).toBeDisabled();
        await click(buttons[0]);
        await click(buttons[1]);
      }
      expect(toastError).toHaveBeenCalledTimes(controls.length);
      expect(toastError).toHaveBeenLastCalledWith("You're offline. Reconnect to play audio.");
      expect(primary).toHaveAccessibleDescription("You're offline. Reconnect to play audio.");
      expect(primary).not.toHaveAttribute('title');
      fireEvent.focus(primary);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        "You're offline. Reconnect to play audio."
      );
      fireEvent.blur(primary);
      for (const slider of screen.queryAllByRole('slider')) {
        expect(slider).not.toHaveAttribute('tabindex');
        fireEvent.keyDown(slider, { key: 'End' });
        fireEvent.keyUp(slider, { key: 'End' });
      }
      expect(h.synthesize).toHaveBeenCalledTimes(calls);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      fireEvent(window, new Event('online'));
      expect(h.primary()).toBe(primary); // No remount required for wake-up.
      expect(primary).not.toHaveAttribute('aria-disabled');
      expect(restart).toBeEnabled();
      expect(h.synthesize).toHaveBeenCalledTimes(calls);
      expect(first.paused).toBe(true);
      for (const slider of screen.queryAllByRole('slider'))
        expect(slider).toHaveAttribute('tabindex', '0');
      await click(primary);
      const resumed = await h.resolve(calls);
      await h.playing(resumed);
      expect(resumed.currentTime).toBe(2);
      expectSpinners(0);
    });
  });
}

vi.mock('../resolver/sourceAudioClient', async importOriginal => ({
  ...(await importOriginal()),
  fetchChapterSourceAudio: async () => ({
    provider: 'aquifer',
    bible: { name: 'Fixture', abbreviation: 'F' },
    bookCode: 'JHN',
    chapter: 3,
    items: [],
    verseAddressable: false,
  }),
}));
