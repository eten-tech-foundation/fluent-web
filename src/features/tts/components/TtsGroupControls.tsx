/**
 * `TtsGroupControls` — ▶ / Stop for a whole pericope group (G3a answer (b)).
 *
 * Pericope mode's unit of playback is the PERICOPE, not the verse: one press
 * reads the group and stops at its end. That is why this is a sibling of
 * `TtsVerseControls` rather than a mode of it — the verse control's second
 * button ("play from here", continuous to the end of the page) is the exact
 * behaviour a group control must NOT have, and there is no honest way to
 * render a two-button control with one button meaningless.
 *
 * Keeping the two apart is also what makes G3a option (a) cheap later: a real
 * per-verse highlight inside a pericope replaces this component, and touches
 * nothing that verse mode uses.
 *
 * Feature-agnostic like its sibling (T3): the host passes playability and
 * playback state in, and the buttons carry descriptive accessible names rather
 * than icon-only semantics (§5.1), at the project's 40x40 touch size.
 */

import React from 'react';

import { Loader2, Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';

export interface TtsGroupControlsProps {
  /** Human-readable group identity for the accessible name, e.g. "1:1-5". */
  groupLabel: string;
  /**
   * §5.1, group scale: a pericope with no playable verse at all cannot be
   * played — the same rule the row control applies to a missing panel-2 verse.
   */
  hasPlayableText: boolean;
  /** A verse in this group is fetching its clip — spinner replaces play (§5.2). */
  isLoading: boolean;
  /** A verse in this group is the playback-active row (the card wash). */
  isPlaying: boolean;
  /**
   * §5.1: Stop is visible while ANYTHING is loading or playing, queue-wide —
   * not just for the group that started it.
   */
  showStop: boolean;
  onPlayGroup: () => void;
  onStop: () => void;
}

export const TtsGroupControls: React.FC<TtsGroupControlsProps> = ({
  groupLabel,
  hasPlayableText,
  isLoading,
  isPlaying,
  showStop,
  onPlayGroup,
  onStop,
}) => {
  const { t } = useTranslation();

  const playLabel = t('ttsPlayPericope', 'Play pericope {{groupLabel}}', { groupLabel });
  const stopLabel = t('ttsStopPlayback', 'Stop playback');

  return (
    <div className='flex items-center gap-1' data-testid='tts-group-controls'>
      <Button
        aria-busy={isLoading}
        aria-label={playLabel}
        disabled={!hasPlayableText}
        size='icon'
        // Alt+P acts on the caret's verse (T2), which in pericope mode reads
        // that verse alone — deliberately NOT this button's group semantics —
        // so the shortcut is not advertised here the way the row control
        // advertises it.
        title={playLabel}
        type='button'
        variant='ghost'
        onClick={onPlayGroup}
      >
        {isLoading ? (
          <Loader2 aria-hidden='true' className='animate-spin' />
        ) : (
          <Play aria-hidden='true' />
        )}
      </Button>
      {showStop && (
        <Button
          aria-label={stopLabel}
          data-active-group={isPlaying || undefined}
          size='icon'
          title={`${stopLabel} (${TTS_KEYBOARD_SHORTCUTS.stop})`}
          type='button'
          variant='ghost'
          onClick={onStop}
        >
          <Square aria-hidden='true' />
        </Button>
      )}
    </div>
  );
};
