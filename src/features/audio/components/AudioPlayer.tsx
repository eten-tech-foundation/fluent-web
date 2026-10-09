import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Pause, Play } from 'lucide-react';

interface AudioPlayerProps {
  /** Playback URL for this take. */
  src: string;
  /** Known duration from the API (null when client didn't report it). Used to show duration before audio loads. */
  initialDuration?: number | null;
  /** Called when this player starts playing, so the parent can pause others. */
  onPlay?: () => void;
  /**
   * External signal: when this changes to true the player should pause.
   * Controlled by the parent when another take starts playing.
   */
  shouldPause?: boolean;
  /** Accent colour for the waveform fill / progress. */
  accentColor?: string;
}

/**
 * Minimal audio player that wraps the native HTMLAudioElement.
 */
const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  initialDuration,
  onPlay,
  shouldPause = false,
  accentColor,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [isLoading, setIsLoading] = useState(false);

  // Pause when parent signals another take has started
  useEffect(() => {
    const audio = audioRef.current;
    if (shouldPause && (isPlaying || (audio && !audio.paused))) {
      audio?.pause();
      setIsPlaying(false);
    }
  }, [shouldPause, isPlaying]);

  const handleToggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      onPlay?.();
      setIsLoading(true);
      void audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsLoading(false);
        });
    }
  }, [isPlaying, onPlay]);

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
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      audio.currentTime = ratio * duration;
    },
    [duration]
  );

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

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
        aria-label={isPlaying ? 'Pause' : 'Play'}
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
        aria-label='Seek audio'
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress * 100)}
        className='relative flex h-8 flex-1 cursor-pointer items-end gap-[2px]'
        role='slider'
        onClick={handleSeek}
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
        {formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
};

export default AudioPlayer;
