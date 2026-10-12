import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';
import { type PlaybackRegistry } from '../registry/PlaybackRegistryStore';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';

import { SourceVerseControl } from './SourceVerseControl';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, string>) =>
      fallback.replace('{{verseRef}}', options?.verseRef ?? ''),
  }),
}));

let registry: PlaybackRegistry;
const Probe = () => {
  registry = usePlaybackRegistry();
  return null;
};
const base = {
  status: 'idle' as 'idle' | 'playing' | 'loading',
  aiMarkedKeys: new Set<string>(),
  verseKey: (ref: string) => `key-${ref}`,
  playVerse: vi.fn(),
  restartVerse: vi.fn(),
};
const mount = (playback = base) =>
  render(
    <>
      <Probe />
      <SourceVerseControl playback={playback} verseRef='1' />
      <SourceVerseControl playback={playback} verseRef='2' />
    </>,
    { wrapper: PlaybackRegistryProvider }
  );

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('SourceVerseControl two-channel adapter', () => {
  it('reacts to pause records and Restart eligibility without a live queue', () => {
    mount();
    const restart = screen.getByRole('button', { name: 'Restart verse 1' });
    expect(restart).toBeDisabled();
    act(() =>
      registry.setRecord('key-1', { itemIndex: 0, verseRef: '1', currentTime: 2, forceTts: false })
    );
    expect(restart).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    expect(base.playVerse).toHaveBeenCalledWith('1');
    fireEvent.click(restart);
    expect(base.restartVerse).toHaveBeenCalledWith('1');
    act(() => registry.clearRecord('key-1'));
    expect(restart).toBeDisabled();
  });

  it.each(['static', 'last dynamic'] as const)('reads %s badge from the idle registry', input => {
    mount();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    act(() =>
      input === 'static'
        ? registry.setStaticAi('key-1', true)
        : registry.setLastDynamicAi('key-1', true)
    );
    expect(screen.getAllByRole('img', { name: 'AI-generated audio' })).toHaveLength(1);
  });

  it('live badge reads the queue, not stale last-run data; idle ignores a different run', () => {
    mount({ ...base, status: 'playing', aiMarkedKeys: new Set(['key-2']) });
    act(() => {
      registry.setLastDynamicAi('key-1', true);
      registry.setLive('key-1');
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    act(() => registry.setLive('key-2'));
    // key-1 remembers its last run, key-2 displays the live queue mark.
    expect(screen.getAllByRole('img', { name: 'AI-generated audio' })).toHaveLength(2);
  });

  it('only the live key spins while the queue waits, never its idle sibling', () => {
    mount({ ...base, status: 'loading' });
    act(() => registry.setLive('key-1'));
    expect(screen.getByRole('button', { name: 'Pause verse 1' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Play verse 2' })).toHaveAttribute(
      'aria-busy',
      'false'
    );
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(1);
  });

  it('offline primary explains, Restart is inert, and reconnect restores both without remount', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mount();
    act(() => registry.setLive('key-1'));
    const primary = screen.getByRole('button', { name: 'Pause verse 1' });
    const restart = screen.getByRole('button', { name: 'Restart verse 1' });
    expect(restart).toBeEnabled();
    online.mockReturnValue(false);
    fireEvent(window, new Event('offline'));
    expect(primary).toHaveAttribute('aria-disabled', 'true');
    expect(primary).toBeVisible();
    expect(restart).toBeDisabled();
    fireEvent.click(primary);
    expect(toastError).toHaveBeenCalledWith("You're offline. Reconnect to play audio.");
    expect(base.playVerse).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    fireEvent(window, new Event('online'));
    expect(primary).not.toHaveAttribute('aria-disabled');
    expect(primary).toHaveAccessibleName('Pause verse 1');
    expect(restart).toBeEnabled();
  });

  it('registry impossibility explains instead of calling the playback host', () => {
    mount();
    act(() => registry.setImpossible('key-1', 'No permitted source'));
    fireEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    expect(toastError).toHaveBeenCalledWith('No permitted source');
    expect(base.playVerse).not.toHaveBeenCalled();
  });
});
