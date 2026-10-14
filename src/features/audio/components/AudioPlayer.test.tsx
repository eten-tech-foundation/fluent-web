import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider, usePlaybackRegistry } from '@/features/tts';

import AudioPlayer from './AudioPlayer';

vi.mock('react-i18next', () => import('@/test/i18n'));

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

  it('pauses another claimant when a second AudioPlayer starts playing', async () => {
    const onPause1 = vi.fn();
    const onPause2 = vi.fn();

    render(
      <PlaybackRegistryProvider>
        <AudioPlayer src='https://example.com/audio1.mp3' onPause={onPause1} />
        <AudioPlayer src='https://example.com/audio2.mp3' onPause={onPause2} />
      </PlaybackRegistryProvider>
    );

    const [play1, play2] = screen.getAllByRole('button', { name: /Play/i });

    // Player 1 plays
    await act(async () => {
      fireEvent.click(play1);
    });
    expect(screen.getAllByRole('button', { name: /Pause/i })).toHaveLength(1);

    // Player 2 plays -> player 1 should be paused by registry eviction
    await act(async () => {
      fireEvent.click(play2);
    });

    expect(pauseStub).toHaveBeenCalled();
    expect(onPause1).toHaveBeenCalledTimes(1);
    expect(onPause2).not.toHaveBeenCalled();
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

  it('supports keyboard navigation via ArrowRight, ArrowLeft, Home, and End', async () => {
    render(
      <PlaybackRegistryProvider>
        <AudioPlayer initialDuration={100} src='https://example.com/audio.mp3' />
      </PlaybackRegistryProvider>
    );

    const slider = screen.getByRole('slider', { name: /Seek audio/i });
    expect(slider).toHaveAttribute('tabIndex', '0');
    expect(slider).toHaveAttribute('aria-valuenow', '0');

    // ArrowRight steps forward (5 seconds / 5%)
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '5');

    // End steps to duration
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '100');

    // ArrowLeft steps backward
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '95');

    // Home steps to 0
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });
});
