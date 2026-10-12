import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider, usePlaybackRegistry } from '@/features/tts';

import AudioPlayer from './AudioPlayer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string, options?: Record<string, unknown>) =>
      (defaultValue ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(options?.[name] ?? '')
      ),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('AudioPlayer with PlaybackRegistry', () => {
  let playStub: ReturnType<typeof vi.spyOn>;
  let pauseStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playStub = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseStub = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('claims playback on the shared registry when playing, pausing other claimants', async () => {
    let capturedRegistry: ReturnType<typeof usePlaybackRegistry> | undefined;

    function RegistrySpy() {
      capturedRegistry = usePlaybackRegistry();
      return null;
    }

    const onPlay = vi.fn();
    const onPause = vi.fn();

    render(
      <PlaybackRegistryProvider>
        <RegistrySpy />
        <AudioPlayer src='https://example.com/audio1.mp3' onPause={onPause} onPlay={onPlay} />
      </PlaybackRegistryProvider>
    );

    const playButton = screen.getByRole('button', { name: /Play/i });

    // Click play
    await act(async () => {
      fireEvent.click(playButton);
    });

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(playStub).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();

    // Now another claimant claims in the shared registry (e.g. drafting TTS starts)
    const otherPause = vi.fn();
    act(() => {
      capturedRegistry!.claim(otherPause);
    });

    // The AudioPlayer should be paused by the registry eviction
    expect(pauseStub).toHaveBeenCalled();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
  });

  it('pauses and releases claim when shouldPause becomes true', async () => {
    const onPause = vi.fn();

    const { rerender } = render(
      <PlaybackRegistryProvider>
        <AudioPlayer shouldPause={false} src='https://example.com/audio.mp3' onPause={onPause} />
      </PlaybackRegistryProvider>
    );

    const playButton = screen.getByRole('button', { name: /Play/i });
    await act(async () => {
      fireEvent.click(playButton);
    });

    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();

    // Parent signals another take started playing
    rerender(
      <PlaybackRegistryProvider>
        <AudioPlayer shouldPause={true} src='https://example.com/audio.mp3' onPause={onPause} />
      </PlaybackRegistryProvider>
    );

    expect(pauseStub).toHaveBeenCalled();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
  });

  it('releases registry claim on user pause', async () => {
    let capturedRegistry: ReturnType<typeof usePlaybackRegistry> | undefined;

    function RegistrySpy() {
      capturedRegistry = usePlaybackRegistry();
      return null;
    }

    const onPause = vi.fn();

    render(
      <PlaybackRegistryProvider>
        <RegistrySpy />
        <AudioPlayer src='https://example.com/audio.mp3' onPause={onPause} />
      </PlaybackRegistryProvider>
    );

    // Play
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Play/i }));
    });
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();

    // Pause
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pause/i }));
    });
    expect(pauseStub).toHaveBeenCalled();
    expect(onPause).toHaveBeenCalledTimes(1);

    // Another claimant claiming should NOT invoke our pause callback again since we released it
    const otherPause = vi.fn();
    act(() => {
      capturedRegistry!.claim(otherPause);
    });
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
