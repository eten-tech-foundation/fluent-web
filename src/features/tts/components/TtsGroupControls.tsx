/**
 * `TtsGroupControls` — ▶ / Stop for a whole pericope group (G3a answer (b)).
 *
 * Pericope mode's unit of playback is the PERICOPE, not the verse, so both
 * play actions are scoped to the group: ▶ reads this pericope and stops at its
 * end, ▶▶ reads from this pericope on to the end of the page. That mirrors the
 * row control's pair exactly — one bounded, one continuous — at group scale.
 *
 * It is a sibling of `TtsVerseControls` rather than a mode of it because the
 * accessible names, the bounded action's semantics and the shortcut hints all
 * differ; sharing the component would mean three conditionals to say "this is
 * a group". Keeping them apart is also what makes G3a option (a) cheap later:
 * a real per-verse highlight inside a pericope replaces this component and
 * touches nothing verse mode uses.
 *
 * Feature-agnostic like its sibling (T3): the host passes playability and
 * playback state in, and the buttons carry descriptive accessible names rather
 * than icon-only semantics (§5.1), at the project's 40x40 touch size — which
 * `../lib/controlLayout` supplies without spending 40px of layout height, the
 * same way the row control does.
 */

import React from 'react';

import { FastForward, Loader2, Pause, Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';
import { TTS_CONTROL_BUTTON_CLASS, TTS_CONTROL_STRIP_CLASS } from '../lib/controlLayout';

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
  /**
   * §5.1: continuous reading from this group to the end of the page — the same
   * meaning the row control's second button carries, at group scale. Without
   * it pericope mode has no DISCOVERABLE way to read on past one blob, since
   * Alt+Shift+P is advertised on controls that do not render here.
   */
  onPlayFromGroup: () => void;
  onPause: () => void;
  onStop: () => void;
}

export const TtsGroupControls: React.FC<TtsGroupControlsProps> = ({
  groupLabel,
  hasPlayableText,
  isLoading,
  isPlaying,
  showStop,
  onPlayGroup,
  onPlayFromGroup,
  onPause,
  onStop,
}) => {
  const { t } = useTranslation();

  const playLabel = t('ttsPlayPericope', 'Play pericope {{groupLabel}}', { groupLabel });
  const playFromLabel = t('ttsPlayFromPericope', 'Play from pericope {{groupLabel}}', {
    groupLabel,
  });
  const stopLabel = t('ttsStopPlayback', 'Stop playback');

  return (
    <div className={TTS_CONTROL_STRIP_CLASS} data-testid='tts-group-controls'>
      <Button
        aria-busy={isLoading}
        aria-label={playLabel}
        className={TTS_CONTROL_BUTTON_CLASS}
        disabled={!hasPlayableText}
        size='icon'
        // Alt+P acts on the caret's verse (T2), which reads that verse ALONE —
        // deliberately not this button's whole-group semantics — so the
        // shortcut is not advertised here.
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
      <Button
        aria-label={playFromLabel}
        className={TTS_CONTROL_BUTTON_CLASS}
        disabled={!hasPlayableText}
        size='icon'
        // Unlike ▶, this one IS Alt+Shift+P: both read from here to the end of
        // the page. (Alt+Shift+P starts at the caret's verse rather than this
        // group's first, which is the same relationship the row control has.)
        title={`${playFromLabel} (${TTS_KEYBOARD_SHORTCUTS.playFromHere})`}
        type='button'
        variant='ghost'
        onClick={onPlayFromGroup}
      >
        <FastForward aria-hidden='true' />
      </Button>
      {/* Temporary functional control; the unified player replaces this strip later. */}
      {showStop && (
        <Button
          aria-label={t('ttsPausePlayback', 'Pause playback')}
          className={TTS_CONTROL_BUTTON_CLASS}
          size='icon'
          type='button'
          variant='ghost'
          onClick={onPause}
        >
          <Pause aria-hidden='true' />
        </Button>
      )}
      {showStop && (
        <Button
          aria-label={stopLabel}
          className={TTS_CONTROL_BUTTON_CLASS}
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
