import React, { useId, useRef } from 'react';

import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { config } from '@/lib/config';
import { useAppStore, type DisplayMode } from '@/store/store';

/**
 * The drafting views, in the order the toggle shows them (#396). Chapter is the entry point into
 * the continuous chapter surface; switching between any of them only changes how the same chapter
 * is presented, never its content.
 */
const DISPLAY_MODES: Array<{ mode: DisplayMode; labelKey: string; fallback: string }> = [
  { mode: 'verse', labelKey: 'verse', fallback: 'Verse' },
  { mode: 'pericope', labelKey: 'pericope', fallback: 'Pericope' },
  { mode: 'chapter', labelKey: 'chapter', fallback: 'Chapter' },
];

/**
 * The keys that move within the group, and how far each one moves. Both axes navigate, which is
 * what the WAI-ARIA radio group pattern asks for. A Map rather than a plain object so a key that
 * is not one of these reads back as `undefined` instead of widening to `number`.
 */
const ARROW_STEPS = new Map<string, number>([
  ['ArrowRight', 1],
  ['ArrowDown', 1],
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
]);

/**
 * The Display selector in the drafting settings menu.
 *
 * A radiogroup rather than three loose buttons: it is one choice among three, and a screen reader
 * should announce it as one control with a selected option. That announcement is only half of the
 * pattern, so the group also behaves like one control for the keyboard — a single tab stop, and
 * the arrow keys move between the options.
 */
export const DisplayModeToggle: React.FC = () => {
  const { t } = useTranslation();
  const displayMode = useAppStore(state => state.displayMode);
  const setDisplayMode = useAppStore(state => state.setDisplayMode);
  const chapterAvailable = useAppStore(
    state =>
      state.chapterViewAvailability?.available === true &&
      state.chapterViewAvailability.chapterAssignmentId ===
        state.currentProjectItem?.chapterAssignmentId
  );
  const labelId = useId();
  const explanationId = useId();
  const explanation = config.features.rtePericope
    ? t('chapterViewUnavailable', 'Chapter view is available once all verses have content.')
    : t('chapterViewDisabled', 'Chapter view is not available in this environment.');
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Roving tabindex: the whole group is one tab stop, and Tab enters it at the checked option.
  // Falling back to the first option keeps a tab stop even if the store ever holds a mode this
  // toggle does not offer, which would otherwise strand keyboard users outside the control.
  const checkedIndex = DISPLAY_MODES.findIndex(option => option.mode === displayMode);
  const isDisabled = (index: number) =>
    DISPLAY_MODES[index].mode === 'chapter' && !chapterAvailable;
  const tabStopIndex = checkedIndex === -1 || isDisabled(checkedIndex) ? 0 : checkedIndex;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = ARROW_STEPS.get(event.key);
    if (step === undefined) {
      return;
    }

    // Enabled options follow focus. The ends wrap, and preventDefault stops vertical arrows
    // from scrolling the settings dialog.
    event.preventDefault();
    const nextIndex = (index + step + DISPLAY_MODES.length) % DISPLAY_MODES.length;
    // Disabled Chapter stays reachable so keyboard users can read its tooltip.
    if (!isDisabled(nextIndex)) setDisplayMode(DISPLAY_MODES[nextIndex].mode);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className='border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm'>
        <span className='text-foreground text-sm font-semibold' id={labelId}>
          {t('display', 'Display')}
        </span>
        <div
          aria-describedby={!chapterAvailable ? explanationId : undefined}
          aria-labelledby={labelId}
          className='border-primary bg-background flex h-9 items-center overflow-hidden rounded-full border'
          role='radiogroup'
        >
          {DISPLAY_MODES.map((option, index) => {
            const disabled = isDisabled(index);
            const button = (
              <button
                ref={element => {
                  optionRefs.current[index] = element;
                }}
                aria-checked={displayMode === option.mode}
                aria-disabled={disabled || undefined}
                className={`flex h-full items-center justify-center px-5 text-xs font-semibold transition-all ${
                  disabled
                    ? 'text-muted-foreground bg-muted cursor-not-allowed opacity-50'
                    : displayMode === option.mode
                      ? 'bg-primary text-primary-foreground cursor-pointer'
                      : 'text-primary hover:bg-primary/10 bg-background cursor-pointer'
                }`}
                role='radio'
                tabIndex={index === tabStopIndex ? 0 : -1}
                type='button'
                onClick={() => {
                  if (!disabled) setDisplayMode(option.mode);
                }}
                onKeyDown={event => handleKeyDown(event, index)}
              >
                {t(option.labelKey, option.fallback)}
              </button>
            );
            return (
              <React.Fragment key={option.mode}>
                {index > 0 && <div className='bg-primary h-full w-px' />}
                {disabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipPortal>
                      <TooltipContent>{explanation}</TooltipContent>
                    </TooltipPortal>
                  </Tooltip>
                ) : (
                  button
                )}
              </React.Fragment>
            );
          })}
        </div>
        {!chapterAvailable && (
          <span className='sr-only' id={explanationId}>
            {explanation}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
};
