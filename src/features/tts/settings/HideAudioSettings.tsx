import { type ComponentPropsWithoutRef, forwardRef, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatureFlag } from '@/features/flags';
import { cn } from '@/lib/utils';

import { AttributionDialog } from '../components/AttributionDialog';
import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';
import { recordedNoticeAckStore, type RecordedNoticeAcknowledgment } from '../lib/ackStore';

import { useHideAudio } from './useHideAudio';

type ShortcutName = keyof typeof TTS_KEYBOARD_SHORTCUTS;

interface ShortcutCardProps extends ComponentPropsWithoutRef<'div'> {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

/** The card is Radix's pointer trigger; its generated description also reaches the switch. */
const ShortcutCard = forwardRef<HTMLDivElement, ShortcutCardProps>(
  ({ checked, className, label, onCheckedChange, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm',
        className
      )}
      {...props}
    >
      <span className='text-foreground text-sm font-semibold'>{label}</span>
      <Switch
        aria-describedby={props['aria-describedby']}
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
);
ShortcutCard.displayName = 'ShortcutCard';

export function HideAudioSettings() {
  const { t } = useTranslation();
  const sourceAudioEnabled = useFeatureFlag('sourceAudio');
  const [hidden, setHidden] = useHideAudio();
  const [attributions, setAttributions] = useState<readonly RecordedNoticeAcknowledgment[] | null>(
    null
  );

  if (!sourceAudioEnabled) return null;

  const shortcutLabels: Record<ShortcutName, string> = {
    play: t('ttsShortcutPlay', 'Play'),
    playFromHere: t('ttsShortcutPlayFromHere', 'Play from here'),
    pause: t('ttsShortcutPause', 'Pause'),
    restart: t('ttsShortcutRestart', 'Restart'),
  };

  return (
    <div className='space-y-2'>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <ShortcutCard
              checked={hidden}
              data-testid='hide-audio-card'
              label={t('hideAudioControls', 'Hide audio controls')}
              onCheckedChange={setHidden}
            />
          </TooltipTrigger>
          {/* Registration lives in hooks/useTtsKeyboardShortcuts.ts; keep every binding in sync. */}
          <TooltipContent>
            <div>
              <p className='font-semibold'>{t('ttsKeyboardShortcuts', 'Keyboard shortcuts')}</p>
              {(Object.keys(TTS_KEYBOARD_SHORTCUTS) as ShortcutName[]).map(name => (
                <p key={name}>
                  {shortcutLabels[name]} {TTS_KEYBOARD_SHORTCUTS[name]}
                </p>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AttributionDialog
        entries={attributions ?? []}
        open={attributions !== null}
        trigger={
          <button
            className='text-sm text-[#0B50D0] hover:underline dark:text-blue-400'
            type='button'
          >
            {t('audioSourcesTitle', 'Audio sources & licences')}
          </button>
        }
        onOpenChange={open => setAttributions(open ? recordedNoticeAckStore.list() : null)}
      />
    </div>
  );
}
