/**
 * `TtsVerseControls` — per-verse ▶ / ▶▶ / Stop (§5.1, T1/T2).
 *
 * Feature-agnostic (T3): the host passes playability and playback state in;
 * this component renders real buttons with descriptive accessible names —
 * never icon-only semantics (§5.1) — and hit areas that meet the project's
 * touch sizing (Button `size='icon'`, 40×40) even though the icons stay
 * visually compact (T2).
 */

import React from 'react';

import { FastForward, Loader2, Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';

export interface TtsVerseControlsProps {
  /** Host-meaningful row identity, used in the accessible names. */
  verseRef: string;
  /**
   * §5.1: a row without playable text (missing panel-2 verse) is not
   * playable — both play actions are disabled.
   */
  hasPlayableText: boolean;
  /** This row's clip is loading — spinner replaces the play icon (§5.2). */
  isLoading: boolean;
  /** This row is the playback-active row. */
  isPlaying: boolean;
  /**
   * §5.1: Stop is clearly visible while ANYTHING is loading or playing —
   * queue-wide, not per-row — and cancels queue + element + prefetch intent.
   */
  showStop: boolean;
  onPlayVerse: () => void;
  onPlayFromHere: () => void;
  onStop: () => void;
  /**
   * T4/§5.4: reserved mirrored target-side record slot. v1 renders a
   * documented EMPTY slot so a future record control (fluent-web#84) drops in
   * without reflowing the TTS layout; recording itself is NOT built here. The
   * shared-stop presentation is already queue-wide via `showStop`.
   */
  recordSlot?: React.ReactNode;
}

export const TtsVerseControls: React.FC<TtsVerseControlsProps> = ({
  verseRef,
  hasPlayableText,
  isLoading,
  isPlaying,
  showStop,
  onPlayVerse,
  onPlayFromHere,
  onStop,
  recordSlot,
}) => {
  const { t } = useTranslation();

  const playLabel = t('ttsPlayVerse', 'Play verse {{verseRef}}', { verseRef });
  const playFromLabel = t('ttsPlayFromHere', 'Play from verse {{verseRef}}', { verseRef });
  const stopLabel = t('ttsStopPlayback', 'Stop playback');

  return (
    <div className='flex items-center gap-1' data-testid='tts-verse-controls'>
      <Button
        aria-busy={isLoading}
        disabled={!hasPlayableText}
        size='icon'
        type='button'
        variant='ghost'
        onClick={onPlayVerse}
        aria-label={playLabel}
        // §5.1: chosen shortcuts are documented in the UI surface.
        title={`${playLabel} (${TTS_KEYBOARD_SHORTCUTS.playVerse})`}
      >
        {isLoading ? (
          // §5.2: activated play icon becomes a spinner until playback starts.
          <Loader2 aria-hidden='true' className='animate-spin' />
        ) : (
          <Play aria-hidden='true' />
        )}
      </Button>
      <Button
        aria-label={playFromLabel}
        disabled={!hasPlayableText}
        size='icon'
        title={`${playFromLabel} (${TTS_KEYBOARD_SHORTCUTS.playFromHere})`}
        type='button'
        variant='ghost'
        onClick={onPlayFromHere}
      >
        <FastForward aria-hidden='true' />
      </Button>
      {showStop && (
        <Button
          aria-label={stopLabel}
          data-active-row={isPlaying || undefined}
          size='icon'
          title={`${stopLabel} (${TTS_KEYBOARD_SHORTCUTS.stop})`}
          type='button'
          variant='ghost'
          onClick={onStop}
        >
          <Square aria-hidden='true' />
        </Button>
      )}
      {/* T4: mirrored target-side record location, reserved — empty in v1. */}
      <span className='inline-flex' data-testid='tts-record-slot'>
        {recordSlot ?? null}
      </span>
    </div>
  );
};
