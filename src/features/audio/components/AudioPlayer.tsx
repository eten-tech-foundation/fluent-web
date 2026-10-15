import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatClock, usePlaybackRegistry } from '@/features/tts';

interface AudioPlayerProps {
  /** Playback URL for this take. */
  src: string;
  /** Known duration from the API (null when client didn't report it). Used to show duration before audio loads. */
  initialDuration?: number | null;
  /** Called when this player starts playing, so the parent can pause others. */
  onPlay?: () => void;
  /** Called when this player pauses or stops playing. */
  onPause?: () => void;
  /** Accent colour for the waveform fill / progress. */
  accentColor?: string;
}

/**
 * Minimal audio player that wraps the native HTMLAudioElement.
 * Integrates with the shared PlaybackRegistry for app-wide exclusivity.
 */
const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  initialDuration,
  onPlay,
  onPause,
  accentColor,
}) => {
  const { t } = useTranslation();
  const registry = usePlaybackRegistry();
  const audioRef = useRef<HTMLAudioElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [isLoading, setIsLoading] = useState(false);

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
    onPause?.();
  }, [onPause]);

  // Cleanup on unmount or src change
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
      }
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [src]);

  const handleToggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      pausePlayback();
    } else {
      onPlay?.();
      setIsLoading(true);

      // Claim exclusivity in the shared registry before starting playback.
      // Any other claimant (e.g. drafting audio or another take) will be paused.
      releaseRef.current?.();
      releaseRef.current = registry.claim(() => {
        const el = audioRef.current;
        if (el) el.pause();
        setIsPlaying(false);
        setIsLoading(false);
        releaseRef.current = null;
        onPause?.();
      });

      void audio
        .play()
        .then(() => {
          // If evicted from the registry while waiting for the play promise:
          if (!releaseRef.current) {
            audio.pause();
            setIsPlaying(false);
            setIsLoading(false);
            return;
          }
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsLoading(false);
          if (releaseRef.current) {
            releaseRef.current();
            releaseRef.current = null;
          }
        });
    }
  }, [isPlaying, onPlay, onPause, pausePlayback, registry]);

  const handleTimeUpdate = useCallback(() => {
    setCurrentTime(audioRef.current?.currentTime ?? 0);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    setDuration(audioRef.current?.duration ?? 0);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
    onPause?.();
  }, [onPause]);

  const seekTo = useCallback(
    (newTime: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const clamped = Math.max(0, Math.min(duration, newTime));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration]
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(ratio * duration);
    },
    [duration, seekTo]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!duration) return;
      // Step by 5 seconds, or 5% of duration if shorter
      const step = Math.min(5, Math.max(1, duration * 0.05));
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
          seekTo(duration);
          break;
      }
    },
    [currentTime, duration, seekTo]
  );

  const progress = duration > 0 ? currentTime / duration : 0;
  const filled = accentColor ?? 'var(--primary)';

  // Build "waveform" bars — static visual, progress-masked via clip
  const BARS = 40;

  return (
    <div className='flex w-full items-center gap-3'>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload='metadata'
        src={src}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Play / Pause button */}
      <button
        aria-label={isPlaying ? t('pause', 'Pause') : t('play', 'Play')}
        className='flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60'
        disabled={isLoading}
        style={{ backgroundColor: filled }}
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
          // Vary heights for a waveform silhouette
          const heights = [
            0.3, 0.5, 0.7, 0.9, 0.6, 0.4, 0.8, 0.95, 0.5, 0.3, 0.7, 0.85, 0.6, 0.4, 1.0, 0.7, 0.45,
            0.6, 0.8, 0.5, 0.35, 0.65, 0.9, 0.55, 0.4, 0.75, 0.6, 0.45, 0.8, 0.95, 0.5, 0.3, 0.7,
            0.85, 0.6, 0.4, 0.55, 0.75, 0.4, 0.25,
          ];
          const h = heights[i % heights.length];
          const barProgress = i / BARS;
          const isPast = barProgress <= progress;

          return (
            <div
              key={i}
              className='flex-1 rounded-sm transition-all duration-75'
              style={{
                height: `${h * 100}%`,
                backgroundColor: isPast ? filled : 'var(--border)',
                minWidth: 0,
              }}
            />
          );
        })}
      </div>

      {/* Duration */}
      <span className='text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums'>
        {formatClock(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
};

export default AudioPlayer;
