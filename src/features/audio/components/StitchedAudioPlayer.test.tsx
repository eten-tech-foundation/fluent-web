import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider } from '@/features/tts';

import StitchedAudioPlayer from './StitchedAudioPlayer';

vi.mock('react-i18next', () => import('@/test/i18n'));

describe('StitchedAudioPlayer', () => {
  const mockTracks = [
    {
      verseNumber: 8,
      takeId: 81,
      downloadUrl: 'https://example.com/take-81.webm',
      durationSeconds: 10,
    },
    {
      verseNumber: 9,
      takeId: 91,
      downloadUrl: 'https://example.com/take-91.webm',
      durationSeconds: 13,
    },
  ];

  const mockSkipped = [
    { verseNumber: 6, reason: 'conflict' as const },
    { verseNumber: 7, reason: 'no recording' as const },
    { verseNumber: 8, reason: 'no active take' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  const renderComponent = (props = {}) =>
    render(
      <PlaybackRegistryProvider>
        <StitchedAudioPlayer
          label='Stitched from verse recordings, vv. 6-9'
          skippedVerses={mockSkipped}
          totalDuration={23}
          tracks={mockTracks}
          {...props}
        />
      </PlaybackRegistryProvider>
    );

  it('renders label, duration, and skipped verses notes', () => {
    renderComponent();

    expect(screen.getByText('Stitched from verse recordings, vv. 6-9')).toBeInTheDocument();
    expect(screen.getByText('0:23')).toBeInTheDocument();
    expect(screen.getByText('Verse 6 not included: conflict')).toBeInTheDocument();
    expect(screen.getByText('Verse 7 not included: no recording')).toBeInTheDocument();
    expect(screen.getByText('Verse 8 not included: no active take')).toBeInTheDocument();
  });

  it('toggles play and pause on button click', async () => {
    renderComponent();

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    const pauseBtn = await screen.findByRole('button', { name: /pause/i });
    fireEvent.click(pauseBtn);

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('supports seeking via keyboard ArrowRight on the slider', () => {
    renderComponent();

    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    // Advances time
    expect(slider).toHaveAttribute('aria-valuetext', '0:01');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
  });

  it('automatically advances to the next track when current track ends while playing', async () => {
    const { container } = renderComponent();

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    const audioElement = container.querySelector('audio');
    expect(audioElement).toHaveAttribute('src', 'https://example.com/take-81.webm');

    // Simulate first track ending
    fireEvent.ended(audioElement!);

    // Should seamlessly update src to next track and continue playing
    expect(audioElement).toHaveAttribute('src', 'https://example.com/take-91.webm');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('stops and resets when the last track ends', async () => {
    const { container } = renderComponent();

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    const audioElement = container.querySelector('audio');

    // End track 1 -> advances to track 2
    fireEvent.ended(audioElement!);
    expect(audioElement).toHaveAttribute('src', 'https://example.com/take-91.webm');

    // End track 2 (last track) -> completes playback
    fireEvent.ended(audioElement!);

    // Now playback is paused and reset to end
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('resets player state when tracks change without crashing on empty or reduced list', async () => {
    const { rerender } = renderComponent();

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    // Now update tracks to empty array
    rerender(
      <PlaybackRegistryProvider>
        <StitchedAudioPlayer
          label='Stitched from verse recordings, vv. 6-9'
          skippedVerses={[]}
          totalDuration={0}
          tracks={[]}
        />
      </PlaybackRegistryProvider>
    );

    // Should reset without throwing error
    expect(screen.getByRole('button', { name: /play/i })).toBeDisabled();
  });

  it('preserves playback position and continues playing when only presigned URLs change', async () => {
    const { container, rerender } = renderComponent();

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    const audioElement = container.querySelector('audio')!;
    expect(audioElement).toHaveAttribute('src', 'https://example.com/take-81.webm');

    // Simulate playback advancing 5 seconds into track 0
    audioElement.currentTime = 5;
    fireEvent.timeUpdate(audioElement);

    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');

    // Refetch produces new presigned URLs but same track identities (verseNumber:takeId)
    const refreshedTracks = [
      {
        verseNumber: 8,
        takeId: 81,
        downloadUrl: 'https://example.com/take-81.webm?expires=123456',
        durationSeconds: 10,
      },
      {
        verseNumber: 9,
        takeId: 91,
        downloadUrl: 'https://example.com/take-91.webm?expires=123456',
        durationSeconds: 13,
      },
    ];

    rerender(
      <PlaybackRegistryProvider>
        <StitchedAudioPlayer
          label='Stitched from verse recordings, vv. 6-9'
          skippedVerses={mockSkipped}
          totalDuration={23}
          tracks={refreshedTracks}
        />
      </PlaybackRegistryProvider>
    );

    // Audio src is swapped to the new URL
    expect(audioElement).toHaveAttribute('src', 'https://example.com/take-81.webm?expires=123456');
    // Position is preserved and playback continues (pause was not called)
    expect(audioElement.currentTime).toBe(5);
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('resets player state when track identity (takeId) changes', async () => {
    const { container, rerender } = renderComponent();

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    const audioElement = container.querySelector('audio')!;
    audioElement.currentTime = 5;
    fireEvent.timeUpdate(audioElement);

    // Track identity changed: verse 8 has a different takeId (take 82 instead of 81)
    const newTakesTracks = [
      {
        verseNumber: 8,
        takeId: 82,
        downloadUrl: 'https://example.com/take-82.webm',
        durationSeconds: 10,
      },
      {
        verseNumber: 9,
        takeId: 91,
        downloadUrl: 'https://example.com/take-91.webm',
        durationSeconds: 13,
      },
    ];

    rerender(
      <PlaybackRegistryProvider>
        <StitchedAudioPlayer
          label='Stitched from verse recordings, vv. 6-9'
          skippedVerses={mockSkipped}
          totalDuration={23}
          tracks={newTakesTracks}
        />
      </PlaybackRegistryProvider>
    );

    // Player state should reset to paused and start of track 0
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
    expect(audioElement.currentTime).toBe(0);
    expect(audioElement).toHaveAttribute('src', 'https://example.com/take-82.webm');
  });
});
