import { useId } from 'react';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Loader2, Pause, Play, PlayOff, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';
import { pressPrimary, pressRestart, unavailableReason } from '../lib/controlActions';
import { PLAYABLE_CONTROL_BUTTON_CLASS } from '../lib/controlLayout';

export type PlayableControlState =
  | 'active'
  | 'playing'
  | 'paused'
  | 'loading'
  | 'offline'
  | 'impossible';

export interface PlayableControlProps {
  playableKey: string;
  /** Human-readable context, not the opaque content key. */
  label: string;
  state: PlayableControlState;
  canRestart: boolean;
  badge: boolean;
  /** Pericope mockup: 24px paint inside the same non-overlapping 40px target. */
  compact?: boolean;
  /** Host has no playable (e.g. a missing reference verse); not a licence latch. */
  disabled?: boolean;
  impossibleReason?: string;
  onPrimary: () => void;
  onRestart: () => void;
}

/** Pure presentation: the host combines registry facts and the live queue. */
export function PlayableControl({
  playableKey,
  label,
  state,
  canRestart,
  badge,
  compact = false,
  disabled = false,
  impossibleReason,
  onPrimary,
  onRestart,
}: PlayableControlProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  const offline = state === 'offline';
  const impossible = state === 'impossible';
  const loading = state === 'loading';
  // Deliberate card reading: primary pauses, never resets; retained Stop is a
  // separate host API. The pause-first visual is pending Chad's confirmation.
  const pauses = state === 'playing' || loading;
  const action = pauses ? t('ttsPause', 'Pause') : t('ttsPlay', 'Play');
  const restart = t('ttsRestart', 'Restart');
  const reason = impossibleReason ?? t('ttsAudioUnavailable', 'Audio is unavailable.');
  // Primary tooltip/aria registration: hooks/useTtsKeyboardShortcuts.ts.
  const shortcut = pauses ? TTS_KEYBOARD_SHORTCUTS.pause : TTS_KEYBOARD_SHORTCUTS.play;
  const disabledReason = unavailableReason(t, {
    offline,
    missing: disabled,
    impossibleReason: impossible ? reason : undefined,
  });
  const restartAllowed = disabledReason === undefined && canRestart;
  const primaryHelp = disabledReason ?? `${action} (${shortcut})`;
  const Icon =
    offline || impossible || disabled ? PlayOff : loading ? Loader2 : pauses ? Pause : Play;

  return (
    <TooltipProvider>
      <div
        className={cn('flex items-center', compact ? 'gap-0' : 'gap-1')}
        data-playable-key={playableKey}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            {/* The wrapper receives hover even when the native button is disabled. */}
            <span className='relative inline-flex'>
              <Button
                aria-busy={loading}
                aria-describedby={disabledReason ? reasonId : undefined}
                aria-disabled={!!disabledReason || undefined}
                aria-keyshortcuts={shortcut}
                aria-label={`${action} ${label}`}
                className={cn(
                  PLAYABLE_CONTROL_BUTTON_CLASS,
                  compact
                    ? 'relative rounded-full before:absolute before:inset-y-2 before:right-1 before:left-3 before:rounded-full before:border before:border-current hover:bg-transparent [&_svg]:size-3.5 [&_svg]:translate-x-1'
                    : 'rounded-full border border-current',
                  (offline || impossible || disabled) && 'text-muted-foreground',
                  disabledReason && 'opacity-50'
                )}
                size='icon'
                type='button'
                variant='ghost'
                onClick={() => pressPrimary(disabledReason, onPrimary)}
              >
                <Icon aria-hidden='true' className={loading ? 'animate-spin' : undefined} />
              </Button>
              {badge && (
                <Sparkles
                  aria-label={t('ttsAiGeneratedAudio', 'AI-generated audio')}
                  className={cn(
                    'text-primary bg-background pointer-events-none absolute rounded-full',
                    compact ? 'top-1 right-0 size-2.5' : '-top-1 -right-1 size-3.5'
                  )}
                  role='img'
                />
              )}
            </span>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent className='z-20' side='bottom'>
              {primaryHelp}
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </Tooltip>
        {/* Restart tooltip/aria registration: hooks/useTtsKeyboardShortcuts.ts. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='inline-flex'>
              <Button
                aria-keyshortcuts={TTS_KEYBOARD_SHORTCUTS.restart}
                aria-label={`${restart} ${label}`}
                className={cn(
                  PLAYABLE_CONTROL_BUTTON_CLASS,
                  compact &&
                    'before:border-muted-foreground/60 relative rounded-full before:absolute before:inset-y-2 before:right-3 before:left-1 before:rounded-full before:border hover:bg-transparent [&_svg]:size-3.5 [&_svg]:-translate-x-1'
                )}
                disabled={!restartAllowed}
                size='icon'
                type='button'
                variant='ghost'
                onClick={() => pressRestart(restartAllowed, onRestart)}
              >
                <RotateCcw aria-hidden='true' />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent className='z-20' side='bottom'>
              {offline
                ? t('ttsOffline', 'Offline')
                : `${restart} (${TTS_KEYBOARD_SHORTCUTS.restart})`}
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </Tooltip>
        {disabledReason && (
          <span className='sr-only' id={reasonId}>
            {disabledReason}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
