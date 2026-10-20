import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AlertTriangle, Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatClock, usePlaybackRegistry } from '@/features/tts';

import {
  type SkippedReason,
  type SkippedVerse,
  type StitchedTrack,
} from '../hooks/useStitchedAudio';

export interface StitchedAudioPlayerProps {
  /** Title label, e.g. "Stitched from verse recordings, vv. 6-9" */
  label: string;
  /** Ordered active verse tracks */
  tracks: StitchedTrack[];
  /** Verses skipped from the sequence, with reasons */
  skippedVerses?: SkippedVerse[];
  /** Total calculated duration of the stitched tracks */
  totalDuration: number;
}

const BARS = 40;
const WAVEFORM_HEIGHTS = [
  0.3, 0.5, 0.7, 0.9, 0.6, 0.4, 0.8, 0.95, 0.5, 0.3, 0.7, 0.85, 0.6, 0.4, 1.0, 0.7, 0.45, 0.6, 0.8,
  0.5, 0.35, 0.65, 0.9, 0.55, 0.4, 0.75, 0.6, 0.45, 0.8, 0.95, 0.5, 0.3, 0.7, 0.85, 0.6, 0.4, 0.55,
  0.75, 0.4, 0.25,
];

function isSameSrc(currentSrc: string, targetUrl: string): boolean {
  if (!currentSrc || !targetUrl) return false;
  try {
    return new URL(targetUrl, window.location.href).href === currentSrc;
  } catch {
    return currentSrc.includes(targetUrl);
  }
}

/**
 * Continuous stitched audio player for verse-recorded pericopes.
 * Sequences active verse takes sequentially and provides a single unified scrub bar.
 * Integrates with PlaybackRegistry for app-wide playback exclusivity.
 */
const StitchedAudioPlayer: React.FC<StitchedAudioPlayerProps> = ({
  label,
  tracks,
  skippedVerses = [],
  totalDuration,
}) => {
  const { t } = useTranslation();
  const registry = usePlaybackRegistry();

  const audioRef = useRef<HTMLAudioElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const currentTrackIndexRef = useRef(0);
  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const tracksKey = tracks.map(t => `${t.verseNumber}:${t.takeId}`).join(',');
  const prevTracksKeyRef = useRef(tracksKey);

  // Reset player when track identity changes, and clean up on unmount
  useEffect(() => {
    const audio = audioRef.current;
    if (prevTracksKeyRef.current !== tracksKey) {
      prevTracksKeyRef.current = tracksKey;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setCurrentTrackIndex(0);
      currentTrackIndexRef.current = 0;
      setCurrentTime(0);
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsLoading(false);
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    }

    return () => {
      if (audio) {
        audio.pause();
      }
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [tracksKey]);

  // Keep audio.src initialized for the current track; when only URLs change, keep currentTime and playback state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !tracks.length) return;
    const track = tracks[currentTrackIndex] as StitchedTrack | undefined;
    if (!track) return;
    if (!isSameSrc(audio.src, track.downloadUrl)) {
      const prevTime = audio.currentTime;
      const wasPlaying = isPlayingRef.current;
      audio.src = track.downloadUrl;
      if (prevTime > 0) {
        audio.currentTime = prevTime;
        const restoreTime = () => {
          audio.currentTime = prevTime;
        };
        audio.addEventListener('loadedmetadata', restoreTime, { once: true });
      }
      if (wasPlaying) {
        void audio.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setIsPlaying(false);
        });
      }
    }
  }, [tracks, currentTrackIndex]);

  // Pre-calculate track start offsets
  const trackOffsets = useRef<number[]>([]);
  useEffect(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const track of tracks) {
      offsets.push(acc);
      acc += track.durationSeconds;
    }
    trackOffsets.current = offsets;
  }, [tracks]);

  const pausePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setIsPlaying(false);
    setIsLoading(false);
    if (releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  }, []);

  // Helper to locate which track and internal offset correspond to a given total time
  const locateTrack = useCallback(
    (targetTotalTime: number) => {
      let accumulated = 0;
      for (let i = 0; i < tracks.length; i++) {
        const d = tracks[i].durationSeconds;
        if (targetTotalTime <= accumulated + d || i === tracks.length - 1) {
          const localOffset = Math.max(0, Math.min(d, targetTotalTime - accumulated));
          return { trackIndex: i, localOffset };
        }
        accumulated += d;
      }
      return { trackIndex: 0, localOffset: 0 };
    },
    [tracks]
  );

  const seekTo = useCallback(
    (targetTotalTime: number) => {
      if (!tracks.length || totalDuration <= 0) return;
      const clamped = Math.max(0, Math.min(totalDuration, targetTotalTime));
      const { trackIndex, localOffset } = locateTrack(clamped);

      setCurrentTime(clamped);

      const audio = audioRef.current;
      if (!audio) return;

      if (trackIndex === currentTrackIndexRef.current) {
        audio.currentTime = localOffset;
      } else {
        currentTrackIndexRef.current = trackIndex;
        setCurrentTrackIndex(trackIndex);
        audio.src = tracks[trackIndex].downloadUrl;
        audio.currentTime = localOffset;
        if (isPlayingRef.current) {
          void audio.play().catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setIsPlaying(false);
          });
        }
      }
    },
    [tracks, totalDuration, locateTrack]
  );

  const handleToggle = useCallback(() => {
    if (!tracks.length) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      pausePlayback();
    } else {
      setIsLoading(true);

      // Claim exclusivity in the shared registry
      releaseRef.current?.();
      releaseRef.current = registry.claim(() => {
        const el = audioRef.current;
        if (el) el.pause();
        setIsPlaying(false);
        setIsLoading(false);
        releaseRef.current = null;
      });

      // If at end, start from beginning
      if (currentTime >= totalDuration && totalDuration > 0) {
        currentTrackIndexRef.current = 0;
        setCurrentTrackIndex(0);
        setCurrentTime(0);
        audio.src = tracks[0].downloadUrl;
        audio.currentTime = 0;
      } else {
        const track = tracks[currentTrackIndexRef.current];
        if (!isSameSrc(audio.src, track.downloadUrl)) {
          const savedTime = audio.currentTime;
          audio.src = track.downloadUrl;
          if (savedTime > 0) {
            audio.currentTime = savedTime;
          }
        }
      }

      setIsPlaying(true);
      void audio
        .play()
        .then(() => {
          if (!releaseRef.current) {
            audio.pause();
            setIsPlaying(false);
            setIsLoading(false);
            return;
          }
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          setIsPlaying(false);
          setIsLoading(false);
          if (releaseRef.current) {
            releaseRef.current();
            releaseRef.current = null;
          }
        });
    }
  }, [tracks, isPlaying, pausePlayback, registry, currentTime, totalDuration]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const currentOffset = trackOffsets.current[currentTrackIndexRef.current] ?? 0;
    const computedTotal = currentOffset + audio.currentTime;
    setCurrentTime(Math.min(totalDuration, computedTotal));
  }, [totalDuration]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrackIndexRef.current < tracks.length - 1) {
      // Advance to next track seamlessly
      const nextIndex = currentTrackIndexRef.current + 1;
      currentTrackIndexRef.current = nextIndex;
      setCurrentTrackIndex(nextIndex);

      const nextTrack = tracks[nextIndex];
      audio.src = nextTrack.downloadUrl;
      audio.currentTime = 0;
      void audio.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setIsPlaying(false);
      });
    } else {
      // Reached end of all tracks
      setIsPlaying(false);
      setCurrentTime(totalDuration);
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    }
  }, [tracks, totalDuration]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(ratio * totalDuration);
    },
    [totalDuration, seekTo]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!totalDuration) return;
      const step = Math.min(5, Math.max(1, totalDuration * 0.05));
      const pageStep = step * 2;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          seekTo(currentTime + step);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          seekTo(currentTime - step);
          break;
        case 'PageUp':
          e.preventDefault();
          seekTo(currentTime + pageStep);
          break;
        case 'PageDown':
          e.preventDefault();
          seekTo(currentTime - pageStep);
          break;
        case 'Home':
          e.preventDefault();
          seekTo(0);
          break;
        case 'End':
          e.preventDefault();
          seekTo(totalDuration);
          break;
      }
    },
    [currentTime, totalDuration, seekTo]
  );

  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;
  const hasTracks = tracks.length > 0;

  const skippedReasonLabels: Record<SkippedReason, string> = {
    conflict: t('conflict', 'conflict'),
    'no recording': t('noRecording', 'no recording'),
    'no active take': t('noActiveTake', 'no active take'),
  };

  return (
    <div
      className='rounded-xl border p-4 transition-colors'
      data-testid='stitched-audio-card'
      style={{
        backgroundColor: 'var(--muted)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} preload='auto' onEnded={handleEnded} onTimeUpdate={handleTimeUpdate} />

      {/* Header title */}
      <h3 className='text-foreground mb-3 text-sm font-semibold'>{label}</h3>

      {/* Player row */}
      <div className='flex w-full items-center gap-3'>
        {/* Play / Pause button */}
        <button
          aria-label={isPlaying ? t('pause', 'Pause') : t('play', 'Play')}
          className='flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60'
          disabled={!hasTracks || isLoading}
          style={{ backgroundColor: 'var(--primary)' }}
          type='button'
          onClick={handleToggle}
        >
          {isLoading ? (
            <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
          ) : isPlaying ? (
            <Pause className='h-4 w-4' fill='white' />
          ) : (
            <Play className='h-4 w-4' fill='white' style={{ marginLeft: '1px' }} />
          )}
        </button>

        {/* Waveform progress bar */}
        <div
          aria-label={t('seekAudio', 'Seek audio')}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuetext={formatClock(currentTime)}
          className='focus-visible:ring-ring relative flex h-8 flex-1 cursor-pointer items-end gap-[2px] rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
          role='slider'
          tabIndex={0}
          onClick={handleSeek}
          onKeyDown={handleKeyDown}
        >
          {Array.from({ length: BARS }).map((_, i) => {
            const h = WAVEFORM_HEIGHTS[i % WAVEFORM_HEIGHTS.length];
            const barProgress = i / BARS;
            const isPast = barProgress <= progress;

            return (
              <div
                key={i}
                className='flex-1 rounded-sm transition-all duration-75'
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isPast ? 'var(--primary)' : 'var(--border)',
                  minWidth: 0,
                }}
              />
            );
          })}
        </div>

        {/* Duration */}
        <span className='text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums'>
          {formatClock(isPlaying || currentTime > 0 ? currentTime : totalDuration)}
        </span>
      </div>

      {/* Skipped verses notes below playback */}
      {skippedVerses.length > 0 && (
        <div
          className='mt-3 flex flex-col gap-1 border-t pt-2.5'
          style={{ borderColor: 'var(--border)' }}
        >
          {skippedVerses.map(skipped => (
            <div
              key={skipped.verseNumber}
              className='flex items-center gap-1.5 text-xs font-medium'
              style={{ color: 'var(--warning-subtle-foreground)' }}
            >
              <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
              <span>
                {t('verseNotIncluded', 'Verse {{verse}} not included: {{reason}}', {
                  verse: skipped.verseNumber,
                  reason: skippedReasonLabels[skipped.reason],
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StitchedAudioPlayer;
